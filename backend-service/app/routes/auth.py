"""
Authentication routes - complete login and JWT implementation
Provides login, logout, and user session management
"""

from fastapi import APIRouter, Request, Depends, HTTPException, status
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from pydantic import BaseModel
from typing import Optional
import time
import jwt
import os
from datetime import datetime, timedelta
from passlib.context import CryptContext
from sqlmodel import Session, select

from ..database.connection import get_sync_session
from ..models.user import User

router = APIRouter()

# Security configurations
SECRET_KEY = os.getenv("SECRET_KEY", "dev_secret_123_change_in_production")
ALGORITHM = "HS256"
ACCESS_TOKEN_EXPIRE_MINUTES = int(os.getenv("ACCESS_TOKEN_EXPIRE_MINUTES", "1440"))  # 24 hours

# Password hashing
pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")
security = HTTPBearer()

# Pydantic models
class LoginRequest(BaseModel):
    username: str
    password: str

class LoginResponse(BaseModel):
    access_token: str
    token_type: str
    expires_in: int
    user_info: dict

class AuthMiddleware:
    """JWT-based authentication middleware"""
    
    def verify_password(self, plain_password: str, hashed_password: str) -> bool:
        """Verify password against hash"""
        return pwd_context.verify(plain_password, hashed_password)
    
    def create_access_token(self, data: dict) -> str:
        """Create JWT access token"""
        to_encode = data.copy()
        expire = datetime.utcnow() + timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES)
        to_encode.update({"exp": expire})
        return jwt.encode(to_encode, SECRET_KEY, algorithm=ALGORITHM)
    
    def verify_token(self, token: str) -> Optional[dict]:
        """Verify JWT token and return user data"""
        try:
            payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
            user_id: str = payload.get("sub")
            if user_id is None:
                return None
            return {
                "user_id": user_id,
                "username": payload.get("username"),
                "role": payload.get("role"),
                "team_id": payload.get("team_id")
            }
        except jwt.PyJWTError:
            return None
    
    async def verify_token_dependency(self, request: Request):
        """FastAPI dependency for token verification - Production mode: Always require authentication"""
        auth_header = request.headers.get("authorization")
        
        if not auth_header:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Authentication required",
                headers={"WWW-Authenticate": "Bearer"},
            )
        
        if not auth_header.startswith("Bearer "):
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Invalid authentication header format. Expected: Bearer <token>",
                headers={"WWW-Authenticate": "Bearer"},
            )
            
        token = auth_header.split(" ")[1]
        user_data = self.verify_token(token)
        
        if not user_data:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Invalid or expired token",
                headers={"WWW-Authenticate": "Bearer"},
            )
            
        return user_data

auth = AuthMiddleware()

# Simple FastAPI dependency function - no need for async
def get_current_user_dependency(request: Request):
    """FastAPI dependency for authentication - synchronous"""
    auth_header = request.headers.get("authorization")
    
    if not auth_header:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Authentication required",
            headers={"WWW-Authenticate": "Bearer"},
        )
    
    if not auth_header.startswith("Bearer "):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid authentication header format. Expected: Bearer <token>",
            headers={"WWW-Authenticate": "Bearer"},
        )
        
    token = auth_header.split(" ")[1]
    user_data = auth.verify_token(token)
    
    if not user_data:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or expired token",
            headers={"WWW-Authenticate": "Bearer"},
        )
        
    return user_data

@router.post("/login", response_model=LoginResponse)
async def login(
    credentials: LoginRequest,
    session: Session = Depends(get_sync_session)
):
    """Authenticate user and return JWT token"""
    
    # Find user by username
    user = session.exec(
        select(User).where(User.username == credentials.username)
    ).first()
    
    if not user:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid username or password"
        )
    
    if not user.is_active:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Account is disabled"
        )
    
    # Verify password
    if not auth.verify_password(credentials.password, user.password_hash):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid username or password"
        )
    
    # Create access token
    token_data = {
        "sub": str(user.id),
        "username": user.username,
        "role": user.role.value,
        "team_id": str(user.team_id)
    }
    access_token = auth.create_access_token(token_data)
    
    return LoginResponse(
        access_token=access_token,
        token_type="bearer",
        expires_in=ACCESS_TOKEN_EXPIRE_MINUTES * 60,  # Convert to seconds
        user_info={
            "user_id": str(user.id),
            "username": user.username,
            "full_name": user.full_name,
            "email": user.email,
            "role": user.role.value,
            "team_id": str(user.team_id)
        }
    )

@router.post("/logout")
async def logout():
    """User logout (token invalidation would be handled client-side)"""
    return {"message": "Successfully logged out"}

@router.get("/me")
def get_current_user_info(user: dict = Depends(get_current_user_dependency)):
    """Get current user information"""
    return {
        "user_id": user["user_id"],
        "username": user["username"],
        "role": user["role"],
        "team_id": user["team_id"],
        "timestamp": time.time()
    }