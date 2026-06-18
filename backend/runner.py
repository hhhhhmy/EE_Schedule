import os
import sys
import subprocess
import threading
import datetime
import json
import logging
import shutil
from pathlib import Path
from sqlalchemy.orm import Session
import models

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# Base directory for all script execution environments
SCRIPTS_ROOT = Path("C:/Projects/backend/scripts")

def get_script_dir(script_id: int) -> Path:
    return SCRIPTS_ROOT / f"script_{script_id}"

def get_venv_path(script_id: int) -> Path:
    script_dir = get_script_dir(script_id)
    return script_dir / "venv"

def get_workspace_path(script_id: int) -> Path:
    script_dir = get_script_dir(script_id)
    return script_dir / "workspace"

def get_python_executable(script_id: int) -> str:
    venv_dir = get_venv_path(script_id)
    if os.name == "nt":  # Windows
        return str(venv_dir / "Scripts" / "python.exe")
    else:  # Linux / Unix
        return str(venv_dir / "bin" / "python")

def setup_environment(script_id: int, code: str, requirements: str):
    """
    Sets up the script code, requirements, venv, and workspace directory.
    Installs pip dependencies if they changed.
    """
    script_dir = get_script_dir(script_id)
    venv_dir = get_venv_path(script_id)
    workspace_dir = get_workspace_path(script_id)

    # 1. Create directories
    script_dir.mkdir(parents=True, exist_ok=True)
    workspace_dir.mkdir(parents=True, exist_ok=True)

    # 2. Save the python script to the workspace (so it executes from there)
    script_file = workspace_dir / "script.py"
    script_file.write_text(code, encoding="utf-8")

    # 3. Create requirements.txt
    req_file = script_dir / "requirements.txt"
    cleaned_reqs = requirements.strip() if requirements else ""
    req_file.write_text(cleaned_reqs, encoding="utf-8")

    # 4. Create virtualenv if it doesn't exist
    if not venv_dir.exists():
        logger.info(f"Creating venv for script {script_id}...")
        # Use sys.executable to ensure we use the same Python version
        subprocess.run([sys.executable, "-m", "venv", str(venv_dir)], check=True)
        logger.info(f"Venv created for script {script_id}.")

    # 5. Install requirements if requirements.txt changed or requirements_installed doesn't match
    req_installed_file = script_dir / "requirements_installed.txt"
    needs_install = True
    if req_installed_file.exists():
        if req_installed_file.read_text(encoding="utf-8") == cleaned_reqs:
            needs_install = False

    if needs_install and cleaned_reqs:
        logger.info(f"Installing requirements for script {script_id}...")
        python_exe = get_python_executable(script_id)
        # Run pip install
        # Configured with Tsinghua PyPI mirror for faster downloads in China region
        pip_command = [
            python_exe, "-m", "pip", "install", "-r", str(req_file)
        ]
        try:
            # We run pip install and capture errors
            res = subprocess.run(pip_command, capture_output=True, text=True, check=True)
            logger.info(f"pip install completed:\n{res.stdout}")
            req_installed_file.write_text(cleaned_reqs, encoding="utf-8")
        except subprocess.CalledProcessError as e:
            logger.error(f"pip install failed for script {script_id}:\n{e.stderr}")
            raise Exception(f"Failed to install dependencies: {e.stderr}")

def run_script_in_background(db_session_factory, execution_id: int, script_id: int):
    """
    Executes the script in a background thread, captures output and saves artifacts.
    """
    db: Session = db_session_factory()
    execution = db.query(models.Execution).filter(models.Execution.id == execution_id).first()
    if not execution:
        db.close()
        return

    execution.status = "running"
    execution.start_time = datetime.datetime.utcnow()
    db.commit()

    script = db.query(models.Script).filter(models.Script.id == script_id).first()
    if not script:
        execution.status = "failed"
        execution.log_content = "Error: Script record not found in database."
        execution.end_time = datetime.datetime.utcnow()
        db.commit()
        db.close()
        return

    workspace_dir = get_workspace_path(script_id)
    python_exe = get_python_executable(script_id)

    # Record files in workspace before run to identify new/modified files (artifacts)
    files_before = {}
    if workspace_dir.exists():
        for f in workspace_dir.iterdir():
            if f.is_file() and f.name != "script.py":
                files_before[f.name] = f.stat().st_mtime

    log_output = []
    exit_code = 0
    status = "success"

    try:
        # 1. Setup/Update environment (code, virtualenv, dependencies)
        # Append progress to log output
        log_output.append(">>> LiteFlow: Preparing execution environment...")
        setup_environment(script_id, script.code, script.requirements)
        log_output.append(">>> LiteFlow: Environment ready. Starting script.py...\n")

        # 2. Run script subprocess
        cmd = [python_exe, "script.py"]
        # Use subprocess.Popen to read output in real-time
        process = subprocess.Popen(
            cmd,
            stdout=subprocess.PIPE,
            stderr=subprocess.STDOUT,  # Combine stdout and stderr
            text=True,
            cwd=str(workspace_dir),
            bufsize=1  # Line buffered
        )

        # Read output line by line as it prints
        while True:
            line = process.stdout.readline()
            if not line and process.poll() is not None:
                break
            if line:
                log_output.append(line)
                # Keep database updated incrementally if logs are long (optional, but let's update it in chunks or at the end to keep DB traffic low)
        
        exit_code = process.wait()
        if exit_code != 0:
            status = "failed"
            log_output.append(f"\n>>> LiteFlow: Process exited with non-zero exit code {exit_code}\n")
        else:
            log_output.append(f"\n>>> LiteFlow: Process finished successfully (exit code 0)\n")

    except Exception as e:
        status = "failed"
        exit_code = -1
        log_output.append(f"\n>>> LiteFlow Error during setup/execution:\n{str(e)}\n")
        logger.exception(f"Execution error for script {script_id}: {str(e)}")

    # 3. Detect generated files (artifacts)
    artifacts_list = []
    if workspace_dir.exists() and status == "success":
        for f in workspace_dir.iterdir():
            if f.is_file() and f.name != "script.py":
                # Check if it is a new file or modified file
                is_artifact = False
                if f.name not in files_before:
                    is_artifact = True
                elif f.stat().st_mtime > files_before[f.name]:
                    is_artifact = True

                if is_artifact:
                    # Determine mime/type roughly
                    ext = f.suffix.lower()
                    mime_type = "application/octet-stream"
                    if ext in [".png", ".jpg", ".jpeg", ".webp"]:
                        mime_type = f"image/{ext[1:]}"
                    elif ext == ".csv":
                        mime_type = "text/csv"
                    elif ext in [".xlsx", ".xls"]:
                        mime_type = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
                    elif ext == ".pdf":
                        mime_type = "application/pdf"
                    elif ext in [".txt", ".log"]:
                        mime_type = "text/plain"
                    elif ext == ".html":
                        mime_type = "text/html"

                    artifacts_list.append({
                        "name": f.name,
                        "path": str(f.relative_to(SCRIPTS_ROOT.parent)),
                        "size": f.stat().st_size,
                        "type": mime_type,
                        "created_at": datetime.datetime.fromtimestamp(f.stat().st_mtime).isoformat()
                    })

    # 4. Save results to Database
    # Fetch execution again to prevent race conditions or session out-of-sync
    db.refresh(execution)
    execution.status = status
    execution.exit_code = exit_code
    execution.end_time = datetime.datetime.utcnow()
    execution.log_content = "".join(log_output)
    execution.artifacts = json.dumps(artifacts_list)
    db.commit()
    db.close()

def trigger_script_execution(db: Session, script_id: int) -> models.Execution:
    """
    Creates an execution record and spawns a background thread to run the script.
    """
    execution = models.Execution(script_id=script_id, status="pending")
    db.add(execution)
    db.commit()
    db.refresh(execution)

    # Local import of SessionLocal to pass to the thread
    from database import SessionLocal
    thread = threading.Thread(
        target=run_script_in_background,
        args=(SessionLocal, execution.id, script_id),
        name=f"LiteFlow-Executor-Script-{script_id}"
    )
    thread.daemon = True
    thread.start()

    return execution
