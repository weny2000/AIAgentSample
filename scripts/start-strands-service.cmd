@echo off
REM Script to start the StrandsAgents service on Windows

echo Starting StrandsAgents service...

REM Change to the strands_agents service directory
cd /d "%~dp0..\strands_agents\service"

REM Check if virtual environment exists, create if not
if not exist ".venv" (
    echo Creating virtual environment...
    python -m venv .venv
)

REM Activate virtual environment
echo Activating virtual environment...
call .venv\Scripts\activate

REM Install dependencies
echo Installing dependencies...
pip install -r requirements.txt

REM Load environment variables if .env file exists
if exist "..\config\.env" (
    echo Loading environment variables from .env file...
    for /f "usebackq tokens=1,2 delims==" %%i in ("..\config\.env") do (
        if not "%%i"=="" if not "%%i:~0,1%"=="#" set %%i=%%j
    )
)

REM Start the service
echo Starting FastAPI service on port 8001...
uvicorn app:app --reload --port 8001 --host 0.0.0.0

pause