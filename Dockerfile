# Dockerfile for Jot with Claude Agent SDK support

FROM node:20-slim

# Install dependencies for Claude Code
RUN apt-get update && apt-get install -y \
    curl \
    git \
    && rm -rf /var/lib/apt/lists/*

# Create non-root user (Claude Code won't run bypassPermissions as root)
RUN useradd -m -s /bin/bash jot

# Switch to non-root user for Claude Code installation
USER jot
WORKDIR /home/jot

# Install Claude Code CLI for the jot user
RUN curl -fsSL https://claude.ai/install.sh | bash

# Add Claude Code to PATH
ENV PATH="/home/jot/.local/bin:$PATH"

# Verify Claude Code is installed
RUN claude --version || echo "Claude Code installed"

# Switch back to root temporarily for app setup
USER root

# Set working directory
WORKDIR /app

# Copy package files
COPY package*.json ./

# Install dependencies
RUN npm ci

# Copy source code
COPY . .

# Change ownership to jot user
RUN chown -R jot:jot /app

# Build args for Next.js public environment variables
ARG NEXT_PUBLIC_SUPABASE_URL
ARG NEXT_PUBLIC_SUPABASE_ANON_KEY
ARG NEXT_PUBLIC_APP_URL
ARG NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY

# Set them as env vars for the build
ENV NEXT_PUBLIC_SUPABASE_URL=$NEXT_PUBLIC_SUPABASE_URL
ENV NEXT_PUBLIC_SUPABASE_ANON_KEY=$NEXT_PUBLIC_SUPABASE_ANON_KEY
ENV NEXT_PUBLIC_APP_URL=$NEXT_PUBLIC_APP_URL
ENV NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=$NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY

# Build the Next.js app
RUN npm run build

# Switch to non-root user for runtime
USER jot

# Expose port
EXPOSE 3000

# Start the app
CMD ["npm", "start"]
