from pydantic import BaseModel, Field
from typing import Optional, List
from datetime import datetime

# Script Schemas
class ScriptBase(BaseModel):
    name: str
    description: Optional[str] = None
    code: str
    requirements: Optional[str] = ""
    cron_expression: Optional[str] = None
    is_active: Optional[bool] = True

class ScriptCreate(ScriptBase):
    pass

class ScriptUpdate(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None
    code: Optional[str] = None
    requirements: Optional[str] = None
    cron_expression: Optional[str] = None
    is_active: Optional[bool] = None

class ScriptResponse(ScriptBase):
    id: int
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True

# Execution Schemas
class ExecutionResponse(BaseModel):
    id: int
    script_id: int
    status: str
    start_time: datetime
    end_time: Optional[datetime] = None
    exit_code: Optional[int] = None
    log_content: str
    artifacts: str  # JSON list string
    script_name: Optional[str] = None  # Helper for listing

    class Config:
        from_attributes = True
