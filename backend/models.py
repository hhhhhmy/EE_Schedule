import datetime
from sqlalchemy import Column, Integer, String, Text, Boolean, DateTime, ForeignKey
from sqlalchemy.orm import relationship
from database import Base

class Script(Base):
    __tablename__ = "scripts"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String, nullable=False)
    description = Column(String, nullable=True)
    code = Column(Text, nullable=False)
    requirements = Column(Text, nullable=True)  # Newline-separated list of dependencies
    cron_expression = Column(String, nullable=True)  # Cron schedule, e.g. "*/5 * * * *"
    is_active = Column(Boolean, default=True)
    created_at = Column(DateTime, default=datetime.datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.datetime.utcnow, onupdate=datetime.datetime.utcnow)

    executions = relationship("Execution", back_populates="script", cascade="all, delete-orphan")

class Execution(Base):
    __tablename__ = "executions"

    id = Column(Integer, primary_key=True, index=True)
    script_id = Column(Integer, ForeignKey("scripts.id", ondelete="CASCADE"), nullable=False)
    status = Column(String, default="pending")  # pending, running, success, failed
    start_time = Column(DateTime, default=datetime.datetime.utcnow)
    end_time = Column(DateTime, nullable=True)
    exit_code = Column(Integer, nullable=True)
    log_content = Column(Text, default="")  # Combined stdout and stderr logs
    artifacts = Column(Text, default="[]")  # JSON string storing list of output file objects

    script = relationship("Script", back_populates="executions")
