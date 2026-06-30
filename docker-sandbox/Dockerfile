FROM node:20-slim

# git + ca-certificates para push a GitHub
RUN apt-get update && \
    apt-get install -y --no-install-recommends git ca-certificates tmux && \
    rm -rf /var/lib/apt/lists/*

# Claude Code CLI
RUN npm install -g @anthropic-ai/claude-code

# Usuario no-root
RUN useradd -m -s /bin/bash agent
USER agent
WORKDIR /home/agent/project

# git identity (sobreescribible con -e en docker run)
RUN git config --global user.name "klugger-agent" && \
    git config --global user.email "agent@klugger.local" && \
    git config --global credential.helper store

ENTRYPOINT ["claude"]
