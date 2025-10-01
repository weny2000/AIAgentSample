"""
Authentication utilities for organization service
"""

async def get_current_user():
    """
    Mock current user for development
    In production, implement proper JWT validation
    """
    return {
        "user_id": "system_user",
        "role": "ADMIN",
        "username": "system"
    }