#!/bin/bash
# Call Analysis Tool - Docker Setup Script
# Usage: ./setup-docker.sh [action]
# Actions: build, start, stop, logs, clean, status

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Configuration
PROJECT_NAME="callanalysistool"
WORKSPACE_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# Functions
print_header() {
    echo -e "${BLUE}════════════════════════════════════════════════════════════${NC}"
    echo -e "${BLUE}$1${NC}"
    echo -e "${BLUE}════════════════════════════════════════════════════════════${NC}"
}

print_success() {
    echo -e "${GREEN}✓ $1${NC}"
}

print_error() {
    echo -e "${RED}✗ $1${NC}"
}

print_warning() {
    echo -e "${YELLOW}⚠ $1${NC}"
}

print_info() {
    echo -e "${BLUE}ℹ $1${NC}"
}

check_prerequisites() {
    print_header "Checking Prerequisites"
    
    if ! command -v docker &> /dev/null; then
        print_error "Docker is not installed"
        echo "Please install Docker Desktop from https://www.docker.com/products/docker-desktop"
        exit 1
    fi
    print_success "Docker is installed"
    
    if ! docker --version &> /dev/null; then
        print_error "Docker daemon is not running"
        echo "Please start Docker Desktop"
        exit 1
    fi
    print_success "Docker daemon is running"
    
    if ! command -v docker-compose &> /dev/null; then
        print_error "Docker Compose is not installed"
        exit 1
    fi
    print_success "Docker Compose is installed"
    
    echo ""
}

check_disk_space() {
    print_info "Checking available disk space..."
    
    available=$(df "$WORKSPACE_ROOT" | awk 'NR==2 {print $4}')
    required=$((20 * 1024 * 1024))  # 20GB in KB
    
    if [ "$available" -lt "$required" ]; then
        print_error "Insufficient disk space"
        print_warning "Available: $(numfmt --to=iec $((available * 1024)))"
        print_warning "Required: 20GB"
        return 1
    else
        available_gb=$((available / 1024 / 1024))
        print_success "Sufficient disk space available (~${available_gb}GB)"
    fi
    echo ""
}

build_images() {
    print_header "Building Docker Images"
    print_warning "This may take 30-60 minutes (large ML models will be downloaded)"
    echo ""
    
    cd "$WORKSPACE_ROOT"
    
    print_info "Building backend image..."
    docker-compose build backend || {
        print_error "Backend build failed"
        print_info "See logs above for details"
        exit 1
    }
    print_success "Backend image built successfully"
    
    print_info "Building frontend image..."
    docker-compose build frontend || {
        print_error "Frontend build failed"
        exit 1
    }
    print_success "Frontend image built successfully"
    
    echo ""
    print_success "All images built successfully!"
    echo ""
}

start_services() {
    print_header "Starting Services"
    
    cd "$WORKSPACE_ROOT"
    
    print_info "Starting containers..."
    docker-compose up -d || {
        print_error "Failed to start containers"
        exit 1
    }
    
    print_success "Containers are starting..."
    echo ""
    
    # Wait for services to be ready
    print_info "Waiting for services to be ready (this may take 1-2 minutes)..."
    sleep 10
    
    # Check backend health
    print_info "Checking backend health..."
    for i in {1..30}; do
        if curl -s http://localhost:5001/api/health > /dev/null 2>&1; then
            print_success "Backend is healthy"
            break
        fi
        if [ $i -eq 30 ]; then
            print_error "Backend health check timed out after 5 minutes"
            print_info "Check logs with: docker-compose logs backend"
            return 1
        fi
        sleep 10
    done
    
    echo ""
    print_success "All services started successfully!"
    echo ""
    print_info "Frontend:    http://localhost:3000"
    print_info "Backend API: http://localhost:5001"
    print_info "Ollama:      http://localhost:11434"
    echo ""
}

stop_services() {
    print_header "Stopping Services"
    
    cd "$WORKSPACE_ROOT"
    docker-compose down || {
        print_error "Failed to stop containers"
        exit 1
    }
    
    print_success "Services stopped"
    echo ""
}

show_status() {
    print_header "Docker Compose Status"
    
    cd "$WORKSPACE_ROOT"
    docker-compose ps
    echo ""
}

show_logs() {
    print_header "Service Logs"
    print_info "Showing logs (Ctrl+C to exit)"
    print_info "Use 'docker-compose logs backend' or 'docker-compose logs frontend' for specific services"
    echo ""
    
    cd "$WORKSPACE_ROOT"
    docker-compose logs -f
}

clean_everything() {
    print_header "Cleaning Up"
    echo ""
    print_warning "This will:"
    echo "  - Stop all containers"
    echo "  - Remove all containers"
    echo "  - Remove all volumes (DATA WILL BE LOST)"
    echo ""
    read -p "Are you sure? Type 'yes' to confirm: " -r
    echo ""
    
    if [[ $REPLY =~ ^[Yy][Ee][Ss]$ ]]; then
        cd "$WORKSPACE_ROOT"
        docker-compose down -v
        print_success "All containers and volumes removed"
    else
        print_info "Cleanup cancelled"
    fi
    echo ""
}

show_usage() {
    cat << EOF
${BLUE}Call Analysis Tool - Docker Setup Script${NC}

Usage: $0 [action]

Actions:
  ${GREEN}build${NC}     - Build Docker images (30-60 min, download ML models)
  ${GREEN}start${NC}     - Start all services
  ${GREEN}stop${NC}      - Stop all services
  ${GREEN}status${NC}    - Show container status
  ${GREEN}logs${NC}      - Show live service logs
  ${GREEN}clean${NC}     - Stop and remove all containers/volumes
  ${GREEN}help${NC}      - Show this help message

Examples:
  # Initial setup
  $0 build
  $0 start

  # Monitor services
  $0 status
  $0 logs

  # Shutdown
  $0 stop

Notes:
  • First build will take 30-60 minutes
  • Requires ~20GB disk space
  • Requires Docker and Docker Compose installed
  • Run from the project root directory
  
Troubleshooting:
  • Build timeout: Check Docker daemon memory/timeout settings
  • Port conflicts: Stop other services using ports 3000, 5001, 11434
  • Container fails: Check logs with: docker-compose logs [service]

EOF
}

# Main script
main() {
    action="${1:-help}"
    
    case "$action" in
        build)
            check_prerequisites
            check_disk_space
            build_images
            ;;
        start)
            check_prerequisites
            start_services
            ;;
        stop)
            stop_services
            ;;
        status)
            show_status
            ;;
        logs)
            show_logs
            ;;
        clean)
            clean_everything
            ;;
        help|--help|-h)
            show_usage
            ;;
        *)
            print_error "Unknown action: $action"
            echo ""
            show_usage
            exit 1
            ;;
    esac
}

main "$@"
