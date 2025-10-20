#!/bin/bash

# Build and Push Optimized Docker Image to ECR
# Script for strands_agents Docker image

set -e  # Exit on any error

# Configuration
ECR_REGISTRY="047786098634.dkr.ecr.us-west-2.amazonaws.com"
ECR_REPOSITORY="aihackathon/aiagentsample"
IMAGE_NAME="strands_agents"
IMAGE_TAG="latest"
AWS_REGION="us-west-2"
DOCKERFILE="Dockerfile.optimized"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

echo -e "${BLUE}=== Building and Pushing Optimized Docker Image ===${NC}"
echo -e "${YELLOW}Image: ${IMAGE_NAME}${NC}"
echo -e "${YELLOW}ECR Repository: ${ECR_REGISTRY}/${ECR_REPOSITORY}${NC}"
echo -e "${YELLOW}Dockerfile: ${DOCKERFILE}${NC}"
echo ""

# Step 1: Authenticate with ECR
echo -e "${BLUE}Step 1: Authenticating with ECR...${NC}"
aws ecr get-login-password --region ${AWS_REGION} | sudo docker login --username AWS --password-stdin ${ECR_REGISTRY}
if [ $? -eq 0 ]; then
    echo -e "${GREEN}✓ ECR authentication successful${NC}"
else
    echo -e "${RED}✗ ECR authentication failed${NC}"
    exit 1
fi
echo ""

# Step 2: Build the Docker image
echo -e "${BLUE}Step 2: Building Docker image...${NC}"
echo -e "${YELLOW}Using ${DOCKERFILE} for optimized build${NC}"
sudo docker build -f ${DOCKERFILE} -t ${IMAGE_NAME}:${IMAGE_TAG} .
if [ $? -eq 0 ]; then
    echo -e "${GREEN}✓ Docker image built successfully${NC}"
else
    echo -e "${RED}✗ Docker build failed${NC}"
    exit 1
fi
echo ""

# Step 3: Tag the image for ECR
echo -e "${BLUE}Step 3: Tagging image for ECR...${NC}"
sudo docker tag ${IMAGE_NAME}:${IMAGE_TAG} ${ECR_REGISTRY}/${ECR_REPOSITORY}:${IMAGE_NAME}
if [ $? -eq 0 ]; then
    echo -e "${GREEN}✓ Image tagged successfully${NC}"
else
    echo -e "${RED}✗ Image tagging failed${NC}"
    exit 1
fi
echo ""

# Step 4: Push to ECR
echo -e "${BLUE}Step 4: Pushing image to ECR...${NC}"
sudo docker push ${ECR_REGISTRY}/${ECR_REPOSITORY}:${IMAGE_NAME}
if [ $? -eq 0 ]; then
    echo -e "${GREEN}✓ Image pushed successfully${NC}"
else
    echo -e "${RED}✗ Image push failed${NC}"
    exit 1
fi
echo ""

# Step 5: Display image information
echo -e "${BLUE}Step 5: Image information${NC}"
echo -e "${YELLOW}Local image size:${NC}"
sudo docker images ${IMAGE_NAME}:${IMAGE_TAG} --format "table {{.Repository}}\t{{.Tag}}\t{{.Size}}"
echo ""

echo -e "${YELLOW}ECR Repository URI:${NC}"
echo "${ECR_REGISTRY}/${ECR_REPOSITORY}:${IMAGE_NAME}"
echo ""

# Step 6: Verify push
echo -e "${BLUE}Step 6: Verifying push to ECR...${NC}"
aws ecr list-images --repository-name ${ECR_REPOSITORY##*/} --region ${AWS_REGION} --query 'imageIds[?imageTag==`'${IMAGE_NAME}'`]'
echo ""

echo -e "${GREEN}=== Build and Push Complete! ===${NC}"
echo -e "${GREEN}Your optimized Docker image is now available at:${NC}"
echo -e "${GREEN}${ECR_REGISTRY}/${ECR_REPOSITORY}:${IMAGE_NAME}${NC}"