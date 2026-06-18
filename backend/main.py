import os
import shutil
import json
from fastapi import FastAPI, Depends, HTTPException, BackgroundTasks
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from sqlalchemy.orm import Session
from pathlib import Path
from typing import List

import models
import schemas
from database import engine, get_db
from scheduler import start_scheduler, shutdown_scheduler, add_or_update_job, remove_job
from runner import trigger_script_execution, SCRIPTS_ROOT

# Initialize Database tables
models.Base.metadata.create_all(bind=engine)

# Lifespan context manager equivalent for older/newer FastAPI
app = FastAPI(title="LiteFlow API", version="1.0.0")

# Enable CORS for frontend development
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # In production, restrict this to the frontend origin
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.on_event("startup")
def startup_event():
    start_scheduler()

@app.on_event("shutdown")
def shutdown_event():
    shutdown_scheduler()

# --- Script Endpoints ---

@app.post("/api/scripts", response_model=schemas.ResponseModel if hasattr(schemas, 'ResponseModel') else schemas.ScriptResponse)
def create_script(script_in: schemas.ScriptCreate, db: Session = Depends(get_db)):
    db_script = models.Script(
        name=script_in.name,
        description=script_in.description,
        code=script_in.code,
        requirements=script_in.requirements,
        cron_expression=script_in.cron_expression,
        is_active=script_in.is_active
    )
    db.add(db_script)
    db.commit()
    db.refresh(db_script)
    
    # Update scheduler if it has a cron expression
    add_or_update_job(db_script)
    
    return db_script

@app.get("/api/scripts", response_model=List[schemas.ScriptResponse])
def read_scripts(db: Session = Depends(get_db)):
    return db.query(models.Script).all()

@app.get("/api/scripts/{script_id}", response_model=schemas.ScriptResponse)
def read_script(script_id: int, db: Session = Depends(get_db)):
    db_script = db.query(models.Script).filter(models.Script.id == script_id).first()
    if not db_script:
        raise HTTPException(status_code=404, detail="Script not found")
    return db_script

@app.put("/api/scripts/{script_id}", response_model=schemas.ScriptResponse)
def update_script(script_id: int, script_in: schemas.ScriptUpdate, db: Session = Depends(get_db)):
    db_script = db.query(models.Script).filter(models.Script.id == script_id).first()
    if not db_script:
        raise HTTPException(status_code=404, detail="Script not found")
    
    # Track if cron changed
    cron_changed = False
    if script_in.cron_expression is not None and script_in.cron_expression != db_script.cron_expression:
        cron_changed = True
    active_changed = False
    if script_in.is_active is not None and script_in.is_active != db_script.is_active:
        active_changed = True

    # Update fields
    for field, value in script_in.model_dump(exclude_unset=True).items():
        setattr(db_script, field, value)
        
    db.commit()
    db.refresh(db_script)
    
    # Update scheduler job
    if cron_changed or active_changed:
        add_or_update_job(db_script)
        
    return db_script

@app.delete("/api/scripts/{script_id}")
def delete_script(script_id: int, db: Session = Depends(get_db)):
    db_script = db.query(models.Script).filter(models.Script.id == script_id).first()
    if not db_script:
        raise HTTPException(status_code=404, detail="Script not found")
    
    # Remove schedule job
    remove_job(script_id)
    
    # Remove directories on disk
    script_dir = SCRIPTS_ROOT / f"script_{script_id}"
    if script_dir.exists():
        try:
            shutil.rmtree(script_dir)
        except Exception as e:
            # Log disk deletion failure but continue deleting DB record
            print(f"Failed to delete disk folder: {str(e)}")

    db.delete(db_script)
    db.commit()
    return {"message": "Script and its environment deleted successfully"}

# --- Execution Endpoints ---

@app.post("/api/scripts/{script_id}/run")
def run_script(script_id: int, db: Session = Depends(get_db)):
    db_script = db.query(models.Script).filter(models.Script.id == script_id).first()
    if not db_script:
        raise HTTPException(status_code=404, detail="Script not found")
    
    execution = trigger_script_execution(db, script_id)
    return {"message": "Execution triggered in background", "execution_id": execution.id}

@app.get("/api/executions", response_model=List[schemas.ExecutionResponse])
def read_executions(limit: int = 50, db: Session = Depends(get_db)):
    executions = db.query(models.Execution).order_by(models.Execution.start_time.desc()).limit(limit).all()
    # Enrich with script name for frontend readability
    enriched = []
    for ex in executions:
        script = db.query(models.Script).filter(models.Script.id == ex.script_id).first()
        ex_dict = schemas.ExecutionResponse.model_validate(ex)
        ex_dict.script_name = script.name if script else f"Deleted Script (ID: {ex.script_id})"
        enriched.append(ex_dict)
    return enriched

@app.get("/api/scripts/{script_id}/executions", response_model=List[schemas.ExecutionResponse])
def read_script_executions(script_id: int, db: Session = Depends(get_db)):
    executions = db.query(models.Execution).filter(models.Execution.script_id == script_id).order_by(models.Execution.start_time.desc()).all()
    script = db.query(models.Script).filter(models.Script.id == script_id).first()
    script_name = script.name if script else f"Script {script_id}"
    
    enriched = []
    for ex in executions:
        ex_dict = schemas.ExecutionResponse.model_validate(ex)
        ex_dict.script_name = script_name
        enriched.append(ex_dict)
    return enriched

@app.get("/api/executions/{execution_id}", response_model=schemas.ExecutionResponse)
def read_execution(execution_id: int, db: Session = Depends(get_db)):
    ex = db.query(models.Execution).filter(models.Execution.id == execution_id).first()
    if not ex:
        raise HTTPException(status_code=404, detail="Execution not found")
    
    script = db.query(models.Script).filter(models.Script.id == ex.script_id).first()
    ex_dict = schemas.ExecutionResponse.model_validate(ex)
    ex_dict.script_name = script.name if script else f"Deleted Script (ID: {ex.script_id})"
    return ex_dict

# --- Artifact Download Endpoint ---

@app.get("/api/artifacts/download")
def download_artifact(path: str):
    """
    Safely download files generated by scripts.
    Parameters:
        path: Path string relative to C:/Projects (e.g., "backend/scripts/script_1/workspace/chart.png")
    """
    base_proj_dir = Path("C:/Projects").resolve()
    # We resolve path relative to projects folder
    target_path = Path("C:/Projects", path).resolve()
    
    # 1. Directory traversal defense: Ensure target_path starts with scripts root
    scripts_dir = SCRIPTS_ROOT.resolve()
    if not str(target_path).startswith(str(scripts_dir)):
        raise HTTPException(status_code=403, detail="Access Denied: Path traversal detected")
        
    # 2. File existence check
    if not target_path.exists() or not target_path.is_file():
        raise HTTPException(status_code=404, detail="Artifact file not found")
        
    return FileResponse(
        path=target_path,
        filename=target_path.name,
        media_type="application/octet-stream"
    )

# --- Serve Frontend Static Files ---
from fastapi.staticfiles import StaticFiles
app.mount("/", StaticFiles(directory=os.path.join(os.path.dirname(__file__), "static"), html=True), name="static")

