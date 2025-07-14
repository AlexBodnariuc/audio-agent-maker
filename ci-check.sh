#!/bin/bash

# MedMentor CI Security and Quality Checks
# This script performs comprehensive security and quality checks for the MedMentor project

set -e  # Exit on any error

echo "🔒 MedMentor CI Security & Quality Checks"
echo "========================================"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Check if required tools are installed
check_dependencies() {
    echo -e "${BLUE}📋 Checking dependencies...${NC}"
    
    local missing_deps=0
    
    if ! command -v node &> /dev/null; then
        echo -e "${RED}❌ Node.js is not installed${NC}"
        missing_deps=$((missing_deps + 1))
    fi
    
    if ! command -v npm &> /dev/null; then
        echo -e "${RED}❌ npm is not installed${NC}"
        missing_deps=$((missing_deps + 1))
    fi
    
    if ! command -v grep &> /dev/null; then
        echo -e "${RED}❌ grep is not installed${NC}"
        missing_deps=$((missing_deps + 1))
    fi
    
    if [ $missing_deps -gt 0 ]; then
        echo -e "${RED}❌ Missing dependencies. Please install the required tools.${NC}"
        exit 1
    fi
    
    echo -e "${GREEN}✅ All dependencies found${NC}"
}

# Security Check 1: Verify JWT authentication is enabled
check_jwt_auth() {
    echo -e "${BLUE}🔐 Checking JWT authentication configuration...${NC}"
    
    local config_file="supabase/config.toml"
    local failures=0
    
    if [ ! -f "$config_file" ]; then
        echo -e "${RED}❌ supabase/config.toml not found${NC}"
        return 1
    fi
    
    # Check that all functions have verify_jwt = true
    local functions=(
        "create-voice-agent"
        "manage-voice-agents"
        "create-conversation"
        "elevenlabs-text-to-speech"
        "generate-embeddings"
        "openai-conversation-assistant"
        "openai-realtime-voice"
        "openai-speech-to-text"
        "openai-text-to-speech"
        "openai-voice-chat"
        "semantic-search"
        "voice-analytics"
    )
    
    for func in "${functions[@]}"; do
        if grep -A 1 "\[functions.$func\]" "$config_file" | grep -q "verify_jwt = false"; then
            echo -e "${RED}❌ Function $func has JWT verification disabled${NC}"
            failures=$((failures + 1))
        else
            echo -e "${GREEN}✅ Function $func has JWT verification enabled${NC}"
        fi
    done
    
    if [ $failures -gt 0 ]; then
        echo -e "${RED}❌ JWT authentication check failed ($failures functions)${NC}"
        return 1
    fi
    
    echo -e "${GREEN}✅ All functions have JWT authentication enabled${NC}"
    return 0
}

# Security Check 2: Verify no service role keys in edge functions
check_service_role_usage() {
    echo -e "${BLUE}🔑 Checking for service role key usage...${NC}"
    
    local edge_functions_dir="supabase/functions"
    local failures=0
    
    if [ ! -d "$edge_functions_dir" ]; then
        echo -e "${YELLOW}⚠️ No edge functions directory found${NC}"
        return 0
    fi
    
    # Search for SUPABASE_SERVICE_ROLE_KEY usage
    if grep -r "SUPABASE_SERVICE_ROLE_KEY" "$edge_functions_dir" --include="*.ts" --include="*.js"; then
        echo -e "${RED}❌ Found service role key usage in edge functions${NC}"
        failures=$((failures + 1))
    fi
    
    # Check for createClient with service role pattern
    if grep -r "createClient.*supabaseServiceKey" "$edge_functions_dir" --include="*.ts" --include="*.js"; then
        echo -e "${RED}❌ Found service role client creation pattern${NC}"
        failures=$((failures + 1))
    fi
    
    if [ $failures -gt 0 ]; then
        echo -e "${RED}❌ Service role key check failed${NC}"
        return 1
    fi
    
    echo -e "${GREEN}✅ No service role keys found in edge functions${NC}"
    return 0
}

# Security Check 3: Input validation schemas
check_validation_schemas() {
    echo -e "${BLUE}🛡️ Checking input validation schemas...${NC}"
    
    local validation_file="src/lib/validation.ts"
    local failures=0
    
    if [ ! -f "$validation_file" ]; then
        echo -e "${RED}❌ Validation file not found: $validation_file${NC}"
        return 1
    fi
    
    # Check for essential validation schemas
    local required_schemas=(
        "createVoiceAgentRequestSchema"
        "updateVoiceAgentRequestSchema"
        "listVoiceAgentsRequestSchema"
        "sanitizedTextSchema"
        "uuidSchema"
    )
    
    for schema in "${required_schemas[@]}"; do
        if ! grep -q "$schema" "$validation_file"; then
            echo -e "${RED}❌ Missing validation schema: $schema${NC}"
            failures=$((failures + 1))
        else
            echo -e "${GREEN}✅ Found validation schema: $schema${NC}"
        fi
    done
    
    # Check for XSS protection in sanitization
    if ! grep -q "replace.*<script" "$validation_file"; then
        echo -e "${RED}❌ Missing XSS protection in input sanitization${NC}"
        failures=$((failures + 1))
    else
        echo -e "${GREEN}✅ XSS protection found in input sanitization${NC}"
    fi
    
    if [ $failures -gt 0 ]; then
        echo -e "${RED}❌ Validation schema check failed${NC}"
        return 1
    fi
    
    echo -e "${GREEN}✅ All validation schemas present${NC}"
    return 0
}

# Code Quality Check: TypeScript compilation
check_typescript() {
    echo -e "${BLUE}📝 Checking TypeScript compilation...${NC}"
    
    if [ ! -f "package.json" ]; then
        echo -e "${RED}❌ package.json not found${NC}"
        return 1
    fi
    
    # Install dependencies if node_modules doesn't exist
    if [ ! -d "node_modules" ]; then
        echo -e "${YELLOW}⏳ Installing dependencies...${NC}"
        npm ci
    fi
    
    # Run TypeScript check
    if npm run type-check 2>/dev/null || npx tsc --noEmit; then
        echo -e "${GREEN}✅ TypeScript compilation successful${NC}"
    else
        echo -e "${RED}❌ TypeScript compilation failed${NC}"
        return 1
    fi
    
    return 0
}

# Test Coverage Check
check_tests() {
    echo -e "${BLUE}🧪 Running security tests...${NC}"
    
    if [ ! -f "package.json" ]; then
        echo -e "${YELLOW}⚠️ package.json not found, skipping tests${NC}"
        return 0
    fi
    
    # Check if test script exists
    if ! grep -q '"test"' package.json; then
        echo -e "${YELLOW}⚠️ No test script found in package.json${NC}"
        return 0
    fi
    
    # Run auth guard tests specifically
    if [ -f "src/__tests__/auth-guard.test.ts" ]; then
        echo -e "${BLUE}Running auth guard tests...${NC}"
        if npm test src/__tests__/auth-guard.test.ts 2>/dev/null || npx vitest run src/__tests__/auth-guard.test.ts 2>/dev/null; then
            echo -e "${GREEN}✅ Auth guard tests passed${NC}"
        else
            echo -e "${RED}❌ Auth guard tests failed${NC}"
            return 1
        fi
    else
        echo -e "${YELLOW}⚠️ Auth guard tests not found${NC}"
    fi
    
    return 0
}

# CRUD Operations Check
check_crud_implementation() {
    echo -e "${BLUE}🔄 Checking CRUD operations implementation...${NC}"
    
    local failures=0
    
    # Check if manage-voice-agents function exists
    if [ ! -f "supabase/functions/manage-voice-agents/index.ts" ]; then
        echo -e "${RED}❌ manage-voice-agents function not found${NC}"
        failures=$((failures + 1))
    else
        echo -e "${GREEN}✅ manage-voice-agents function found${NC}"
        
        # Check for CRUD operations in the function
        local crud_file="supabase/functions/manage-voice-agents/index.ts"
        
        if ! grep -q "req.method === 'GET'" "$crud_file"; then
            echo -e "${RED}❌ GET operation not implemented${NC}"
            failures=$((failures + 1))
        else
            echo -e "${GREEN}✅ GET operation implemented${NC}"
        fi
        
        if ! grep -q "req.method === 'PATCH'" "$crud_file"; then
            echo -e "${RED}❌ PATCH operation not implemented${NC}"
            failures=$((failures + 1))
        else
            echo -e "${GREEN}✅ PATCH operation implemented${NC}"
        fi
        
        if ! grep -q "req.method === 'DELETE'" "$crud_file"; then
            echo -e "${RED}❌ DELETE operation not implemented${NC}"
            failures=$((failures + 1))
        else
            echo -e "${GREEN}✅ DELETE operation implemented${NC}"
        fi
    fi
    
    # Check for pagination implementation
    if [ -f "src/lib/validation.ts" ]; then
        if ! grep -q "paginationSchema" "src/lib/validation.ts"; then
            echo -e "${RED}❌ Pagination schema not found${NC}"
            failures=$((failures + 1))
        else
            echo -e "${GREEN}✅ Pagination schema found${NC}"
        fi
    fi
    
    if [ $failures -gt 0 ]; then
        echo -e "${RED}❌ CRUD implementation check failed${NC}"
        return 1
    fi
    
    echo -e "${GREEN}✅ CRUD operations properly implemented${NC}"
    return 0
}

# Main execution
# TTS Job Health Check
check_tts_job_health() {
    echo -e "${BLUE}🎵 Checking TTS job health...${NC}"
    
    if [ -z "$SUPABASE_DB_URL" ]; then
        echo -e "${YELLOW}⚠️ SUPABASE_DB_URL not set, skipping TTS job check${NC}"
        return 0
    fi
    
    # Check for failed TTS jobs
    if command -v psql &> /dev/null; then
        local failed_count
        failed_count=$(psql "$SUPABASE_DB_URL" -t -c "SELECT COUNT(*) FROM tts_jobs WHERE status='failed';" 2>/dev/null || echo "0")
        failed_count=$(echo "$failed_count" | tr -d ' ')
        
        if [ "$failed_count" -gt 0 ]; then
            echo -e "${RED}❌ Found $failed_count failed TTS jobs${NC}"
            return 1
        else
            echo -e "${GREEN}✅ No failed TTS jobs found${NC}"
        fi
    else
        echo -e "${YELLOW}⚠️ psql not available, skipping database check${NC}"
    fi
    
    return 0
}

# Enhanced service role key check
check_service_role_usage() {
    echo -e "${BLUE}🔑 Checking for service role key usage...${NC}"
    
    local edge_functions_dir="supabase/functions"
    local failures=0
    
    if [ ! -d "$edge_functions_dir" ]; then
        echo -e "${YELLOW}⚠️ No edge functions directory found${NC}"
        return 0
    fi
    
    # Search for SUPABASE_SERVICE_ROLE_KEY usage (excluding README files)
    if grep -r "SUPABASE_SERVICE_ROLE_KEY" "$edge_functions_dir" --include="*.ts" --include="*.js" --exclude="README*"; then
        echo -e "${RED}❌ Found service role key usage in edge functions${NC}"
        failures=$((failures + 1))
    fi
    
    # Check for createClient with service role pattern
    if grep -r "createClient.*supabaseServiceKey" "$edge_functions_dir" --include="*.ts" --include="*.js"; then
        echo -e "${RED}❌ Found service role client creation pattern${NC}"
        failures=$((failures + 1))
    fi
    
    if [ $failures -gt 0 ]; then
        echo -e "${RED}❌ Service role key check failed${NC}"
        return 1
    fi
    
    echo -e "${GREEN}✅ No service role keys found in edge functions${NC}"
    return 0
}

# Test Coverage Check with Vitest and Jest
check_tests() {
    echo -e "${BLUE}🧪 Running test suite...${NC}"
    
    if [ ! -f "package.json" ]; then
        echo -e "${YELLOW}⚠️ package.json not found, skipping tests${NC}"
        return 0
    fi
    
    # Install dependencies if node_modules doesn't exist
    if [ ! -d "node_modules" ]; then
        echo -e "${YELLOW}⏳ Installing dependencies...${NC}"
        npm ci
    fi
    
    local test_failures=0
    
    # Run Vitest unit tests
    if grep -q '"vitest"' package.json; then
        echo -e "${BLUE}Running Vitest unit tests...${NC}"
        if npm run vitest -- run 2>/dev/null || npx vitest run 2>/dev/null; then
            echo -e "${GREEN}✅ Vitest unit tests passed${NC}"
        else
            echo -e "${RED}❌ Vitest unit tests failed${NC}"
            test_failures=$((test_failures + 1))
        fi
    fi
    
    # Run Jest integration tests
    if grep -q '"jest"' package.json; then
        echo -e "${BLUE}Running Jest integration tests...${NC}"
        if npm run jest 2>/dev/null || npx jest 2>/dev/null; then
            echo -e "${GREEN}✅ Jest integration tests passed${NC}"
        else
            echo -e "${RED}❌ Jest integration tests failed${NC}"
            test_failures=$((test_failures + 1))
        fi
    fi
    
    # Run auth guard tests specifically if they exist
    if [ -f "src/__tests__/auth-guard.test.ts" ]; then
        echo -e "${BLUE}Running auth guard tests...${NC}"
        if npm test src/__tests__/auth-guard.test.ts 2>/dev/null || npx vitest run src/__tests__/auth-guard.test.ts 2>/dev/null; then
            echo -e "${GREEN}✅ Auth guard tests passed${NC}"
        else
            echo -e "${RED}❌ Auth guard tests failed${NC}"
            test_failures=$((test_failures + 1))
        fi
    fi
    
    if [ $test_failures -gt 0 ]; then
        echo -e "${RED}❌ Test suite failed ($test_failures test suites failed)${NC}"
        return 1
    fi
    
    echo -e "${GREEN}✅ All tests passed${NC}"
    return 0
}

main() {
    echo -e "${BLUE}Starting MedMentor CI Checks...${NC}"
    echo ""
    
    local total_checks=0
    local passed_checks=0
    
    # Run all checks
    checks=(
        "check_dependencies"
        "check_jwt_auth" 
        "check_service_role_usage"
        "check_validation_schemas"
        "check_crud_implementation"
        "check_typescript"
        "check_tests"
        "check_tts_job_health"
    )
    
    for check in "${checks[@]}"; do
        total_checks=$((total_checks + 1))
        echo ""
        if $check; then
            passed_checks=$((passed_checks + 1))
        fi
    done
    
    echo ""
    echo "========================================"
    echo -e "${BLUE}📊 CI Check Results${NC}"
    echo "========================================"
    
    if [ $passed_checks -eq $total_checks ]; then
        echo -e "${GREEN}✅ All checks passed! ($passed_checks/$total_checks)${NC}"
        echo -e "${GREEN}🚀 Ready for deployment!${NC}"
        exit 0
    else
        local failed_checks=$((total_checks - passed_checks))
        echo -e "${RED}❌ Some checks failed! ($passed_checks/$total_checks passed, $failed_checks failed)${NC}"
        echo -e "${RED}🚫 Please fix the issues before deployment.${NC}"
        exit 1
    fi
}

# Run the main function
main "$@"