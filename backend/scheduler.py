import logging
from apscheduler.schedulers.background import BackgroundScheduler
from apscheduler.triggers.cron import CronTrigger
from sqlalchemy.orm import Session
from database import SessionLocal
import models

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# Initialize background scheduler
scheduler = BackgroundScheduler()

def run_scheduled_job(script_id: int):
    """
    Trigger function called by APScheduler when a cron trigger fires.
    """
    logger.info(f"Scheduler triggered run for script ID {script_id}")
    db = SessionLocal()
    try:
        from runner import trigger_script_execution
        trigger_script_execution(db, script_id)
    except Exception as e:
        logger.error(f"Error executing scheduled script {script_id}: {str(e)}")
    finally:
        db.close()

def start_scheduler():
    """
    Starts the scheduler and registers all active script schedules from the database.
    """
    if not scheduler.running:
        scheduler.start()
        logger.info("APScheduler background scheduler started.")

    db = SessionLocal()
    try:
        active_scripts = db.query(models.Script).filter(
            models.Script.is_active == True,
            models.Script.cron_expression.isnot(None),
            models.Script.cron_expression != ""
        ).all()
        
        for script in active_scripts:
            add_or_update_job(script)
            
        logger.info(f"Loaded {len(active_scripts)} active script schedules.")
    except Exception as e:
        logger.error(f"Failed to load schedules from database: {str(e)}")
    finally:
        db.close()

def add_or_update_job(script: models.Script):
    """
    Adds a job to the scheduler, or updates it if it already exists.
    If the script is inactive or has no cron expression, any existing job is removed.
    """
    job_id = f"script_{script.id}"
    
    # Check if job exists
    existing_job = scheduler.get_job(job_id)
    
    # If script is inactive or cron is missing, remove job if it exists
    if not script.is_active or not script.cron_expression:
        if existing_job:
            scheduler.remove_job(job_id)
            logger.info(f"Removed job {job_id} from scheduler (script inactive or cron removed).")
        return

    # Try parsing cron expression
    try:
        trigger = CronTrigger.from_crontab(script.cron_expression)
    except Exception as e:
        logger.error(f"Invalid cron expression '{script.cron_expression}' for script {script.id}: {str(e)}")
        if existing_job:
            scheduler.remove_job(job_id)
        return

    if existing_job:
        # Update existing job trigger
        scheduler.reschedule_job(job_id, trigger=trigger)
        logger.info(f"Rescheduled job {job_id} with cron: '{script.cron_expression}'")
    else:
        # Add new job
        scheduler.add_job(
            run_scheduled_job,
            trigger=trigger,
            args=[script.id],
            id=job_id,
            max_instances=1,
            replace_existing=True
        )
        logger.info(f"Scheduled new job {job_id} with cron: '{script.cron_expression}'")

def remove_job(script_id: int):
    """
    Removes a script from the scheduler entirely.
    """
    job_id = f"script_{script_id}"
    if scheduler.get_job(job_id):
        scheduler.remove_job(job_id)
        logger.info(f"Removed job {job_id} from scheduler.")

def shutdown_scheduler():
    if scheduler.running:
        scheduler.shutdown()
        logger.info("APScheduler shut down.")
