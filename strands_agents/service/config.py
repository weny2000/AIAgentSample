import os
from pathlib import Path
from dotenv import load_dotenv

def load_config():
    """Load environment variables from the .env file in the config directory."""
    # Get the path to the config/.env file relative to this module
    current_dir = Path(__file__).parent
    config_dir = current_dir.parent / "config"
    env_file = config_dir / ".env"
    
    if env_file.exists():
        load_dotenv(env_file)
        print(f"Loaded configuration from: {env_file}")
    else:
        print(f"Warning: .env file not found at {env_file}")
        print("Using system environment variables only")