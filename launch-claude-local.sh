#!/bin/bash
# Launch Claude Code with environment variables from .env

# Load environment variables from .env
set -a
source .env
set +a

# Launch Claude Code
claude