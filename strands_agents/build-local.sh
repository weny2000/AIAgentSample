#!/bin/bash

# Quick Build Script for Development
# Builds the optimized Docker image locally without pushing to ECR

set -e

IMAGE_NAME="strands_agents"
IMAGE_TAG="latest"
DOCKERFILE="Dockerfile.optimized"

echo "🐋 Building optimized Docker image..."
echo "Image: ${IMAGE_NAME}:${IMAGE_TAG}"
echo "Dockerfile: ${DOCKERFILE}"
echo ""

# Build the image
sudo docker build -f ${DOCKERFILE} -t ${IMAGE_NAME}:${IMAGE_TAG} .

echo ""
echo "✅ Build complete!"
echo ""
echo "📊 Image size:"
sudo docker images ${IMAGE_NAME}:${IMAGE_TAG} --format "table {{.Repository}}\t{{.Tag}}\t{{.Size}}"
echo ""
echo "🚀 To run the container locally:"
echo "sudo docker run -p 8000:8000 ${IMAGE_NAME}:${IMAGE_TAG}"
echo ""
echo "☁️  To push to ECR, run:"
echo "./build-and-push.sh"