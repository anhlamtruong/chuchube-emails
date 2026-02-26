"""Supabase Vault integration — encrypted credential storage.

Uses raw SQL to interact with the vault.create_secret / vault.secrets /
vault.decrypted_secrets views provided by the Supabase Vault extension.

Prerequisites:
  Run in Supabase SQL Editor:
    CREATE EXTENSION IF NOT EXISTS supabase_vault WITH SCHEMA vault;
"""
from sqlalchemy import text
from sqlalchemy.orm import Session
from app.logging_config import get_logger
from app.services.audit_service import log_audit

logger = get_logger("vault")


def store_secret(
    db: Session,
    name: str,
    value: str,
    description: str = "",
    *,
    user_id: str | None = None,
    ip_address: str | None = None,
    user_agent: str | None = None,
) -> str | None:
    """Store a secret in Supabase Vault. Returns the secret UUID or None on error."""
    try:
        result = db.execute(
            text("SELECT vault.create_secret(:value, :name, :description)"),
            {"value": value, "name": name, "description": description},
        )
        secret_id = result.scalar()
        if user_id:
            log_audit(
                db,
                user_id=user_id,
                event_type="credential.created",
                resource_type="vault_secret",
                resource_id=name,
                detail={"description": description},
                ip_address=ip_address,
                user_agent=user_agent,
            )
        db.commit()
        logger.info(f"Stored vault secret: {name}")
        return str(secret_id) if secret_id else None
    except Exception as e:
        db.rollback()
        logger.error(f"Failed to store vault secret {name}: {e}")
        raise


def get_secret(
    db: Session,
    name: str,
    *,
    user_id: str | None = None,
    ip_address: str | None = None,
    user_agent: str | None = None,
) -> str | None:
    """Retrieve the decrypted value of a vault secret by name."""
    try:
        result = db.execute(
            text("SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = :name"),
            {"name": name},
        )
        row = result.fetchone()
        if user_id:
            log_audit(
                db,
                user_id=user_id,
                event_type="credential.accessed",
                resource_type="vault_secret",
                resource_id=name,
                ip_address=ip_address,
                user_agent=user_agent,
            )
            db.commit()
        return row[0] if row else None
    except Exception as e:
        logger.error(f"Failed to retrieve vault secret {name}: {e}")
        raise


def update_secret(
    db: Session,
    name: str,
    new_value: str,
    *,
    user_id: str | None = None,
    ip_address: str | None = None,
    user_agent: str | None = None,
) -> bool:
    """Update an existing vault secret's value."""
    try:
        db.execute(
            text("UPDATE vault.secrets SET secret = :value WHERE name = :name"),
            {"value": new_value, "name": name},
        )
        if user_id:
            log_audit(
                db,
                user_id=user_id,
                event_type="credential.updated",
                resource_type="vault_secret",
                resource_id=name,
                ip_address=ip_address,
                user_agent=user_agent,
            )
        db.commit()
        logger.info(f"Updated vault secret: {name}")
        return True
    except Exception as e:
        db.rollback()
        logger.error(f"Failed to update vault secret {name}: {e}")
        raise


def delete_secret(
    db: Session,
    name: str,
    *,
    user_id: str | None = None,
    ip_address: str | None = None,
    user_agent: str | None = None,
) -> bool:
    """Delete a vault secret by name."""
    try:
        db.execute(
            text("DELETE FROM vault.secrets WHERE name = :name"),
            {"name": name},
        )
        if user_id:
            log_audit(
                db,
                user_id=user_id,
                event_type="credential.deleted",
                resource_type="vault_secret",
                resource_id=name,
                ip_address=ip_address,
                user_agent=user_agent,
            )
        db.commit()
        logger.info(f"Deleted vault secret: {name}")
        return True
    except Exception as e:
        db.rollback()
        logger.error(f"Failed to delete vault secret {name}: {e}")
        raise
