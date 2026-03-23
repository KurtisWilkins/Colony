"""
SQLAlchemy session management for the automation server.
Uses a scoped session factory so each thread gets its own session.
"""

import logging

from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker, scoped_session

import config

logger = logging.getLogger(__name__)

_engine = None
Session = None


def get_engine():
    """Return the global SQLAlchemy engine, creating it on first call."""
    global _engine
    if _engine is None:
        _engine = create_engine(
            config.SQLALCHEMY_DATABASE_URI,
            pool_size=10,
            max_overflow=20,
            pool_pre_ping=True,
            pool_recycle=3600,
            echo=False,
        )
        logger.info("Database engine created: %s", config.POSTGRES_HOST)
    return _engine


def init_session():
    """Initialise the global scoped session factory. Must be called once at startup."""
    global Session
    engine = get_engine()
    session_factory = sessionmaker(bind=engine)
    Session = scoped_session(session_factory)
    logger.info("Database session factory initialised")
    return Session


def get_session():
    """
    Return a new session from the scoped factory.
    Caller is responsible for committing/closing.
    """
    if Session is None:
        init_session()
    return Session()


def close_session():
    """Remove the scoped session (returns connection to pool)."""
    if Session is not None:
        Session.remove()
