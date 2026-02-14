#!/bin/bash

# Sutra - Automated Test Script
# Tests all TUI features using tmux for automated key inputs

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
NC='\033[0m' # No Color

# Test results
PASS_COUNT=0
FAIL_COUNT=0
SKIP_COUNT=0

# Session name
SESSION="opentui-test"

# Log file
LOG_FILE="/tmp/tui-test.log"

# Repository root (directory containing this script)
ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# Function to log messages
log() {
    echo -e "$1"
    echo -e "$1" >> "$LOG_FILE"
}

# Function to clean up tmux session
cleanup() {
    tmux kill-session -t $SESSION 2>/dev/null || true
}

# Function to run a test (with API error tolerance)
run_test() {
    local test_name="$1"
    local keys="$2"
    local expected="$3"
    local wait_time="${4:-2}"
    local alt_expected="${5:-}"  # Alternative expected (for API errors)
    
    # Send keys - handle special keys (Enter, Escape, Down, Up, Tab) by splitting on spaces
    # Regular text should be sent directly with -l flag
    for key in $keys; do
        case "$key" in
            Enter|Escape|Down|Up|Tab|Left|Right|C-q|C-r|C-u|C-y)
                tmux send-keys -t $SESSION "$key"
                ;;
            *)
                # Send as literal text
                tmux send-keys -t $SESSION -l "$key"
                ;;
        esac
        sleep 0.2
    done
    sleep "$wait_time"
    
    # Capture screen
    OUTPUT=$(tmux capture-pane -t $SESSION -p)
    
    # Check for expected content
    if echo "$OUTPUT" | grep -q "$expected"; then
        log "${GREEN}✓ PASS${NC}: $test_name"
        ((PASS_COUNT++))
        return 0
    # Check for alternative (API error is acceptable for API-dependent tests)
    elif [ -n "$alt_expected" ] && echo "$OUTPUT" | grep -q "$alt_expected"; then
        log "${YELLOW}⚠ SKIP${NC}: $test_name (API unavailable: $alt_expected)"
        ((SKIP_COUNT++))
        return 0
    else
        log "${RED}✗ FAIL${NC}: $test_name"
        log "  Expected: $expected"
        log "  Output preview: $(echo "$OUTPUT" | head -10 | tr '\n' ' ')"
        log "  Full check: $(echo "$OUTPUT" | grep -c "$expected" || echo "0") matches"
        ((FAIL_COUNT++))
        return 1
    fi
}

# Function to run test without sending keys (just check current state)
check_state() {
    local test_name="$1"
    local expected="$2"
    
    OUTPUT=$(tmux capture-pane -t $SESSION -p)
    
    if echo "$OUTPUT" | grep -q "$expected"; then
        log "${GREEN}✓ PASS${NC}: $test_name"
        ((PASS_COUNT++))
        return 0
    else
        log "${RED}✗ FAIL${NC}: $test_name"
        log "  Expected: $expected"
        ((FAIL_COUNT++))
        return 1
    fi
}

# Start
echo ""
echo "╔══════════════════════════════════════════════════════════════╗"
echo "║           Sutra - Test Suite                      ║"
echo "╚══════════════════════════════════════════════════════════════╝"
echo ""
log "Log file: $LOG_FILE"

# Clear log file
> "$LOG_FILE"

# Cleanup any existing session
cleanup

# Build the project first
log "Building project..."
cd "$ROOT_DIR"
if npm run build > /dev/null 2>&1; then
    log "Build successful"
else
    log "${RED}Build failed${NC}"
    exit 1
fi

# Start TUI in tmux with larger terminal size
log "\nStarting TUI..."
tmux new-session -d -s $SESSION -x 120 -y 50 -c "$ROOT_DIR" 'node dist/index.js start 2>&1'
sleep 6  # Increased wait time for app to fully load

# ============================================
# JIRA TESTS
# ============================================
log "\n─────────────────────────────────────────────────────────────────"
log "JIRA TESTS"
log "─────────────────────────────────────────────────────────────────"

# Test 1: App starts and shows header
check_state "App Startup - Header appears" "Sutra"

# Test 1b: Header shows connection status
check_state "Header - Connection Status" "connected"

# Test 1c: Header stable on arrow keys (no duplication)
tmux send-keys -t $SESSION Down
sleep 0.5
tmux send-keys -t $SESSION Up
sleep 0.5
OUTPUT=$(tmux capture-pane -t $SESSION -p)
HEADER_COUNT=$(echo "$OUTPUT" | grep -c "Sutra" || echo "0")
if [ "$HEADER_COUNT" -eq "1" ]; then
    log "${GREEN}✓ PASS${NC}: Header - No Duplication on Arrow Keys"
    ((PASS_COUNT++))
else
    log "${RED}✗ FAIL${NC}: Header - No Duplication on Arrow Keys (found $HEADER_COUNT headers)"
    ((FAIL_COUNT++))
fi

# Test 2: Jira menu visible with Search option
check_state "Jira Menu - Search option visible" "Search Tickets"

# Test 3: Browse all tickets (with API error tolerance)
# Increased wait time for API response
run_test "Browse All Tickets" "Enter" "Recent Tickets" 5 "Error"

# Test 4: Navigate with arrows (needs API data loaded first)
sleep 1  # Rate limit pause
run_test "Arrow Key Navigation" "Down Down" "SAM1" 2 "Error"

# Test 5: Select a ticket and view detail
sleep 1  # Rate limit pause
run_test "Ticket Detail View" "Enter" "STATUS" 5 "Error"

# ============================================
# INTERACTIVE DETAIL UI TESTS
# ============================================
log "\n─────────────────────────────────────────────────────────────────"
log "INTERACTIVE DETAIL UI TESTS"
log "─────────────────────────────────────────────────────────────────"

# Test 6: Navigate down to Title from Status
sleep 1
run_test "Navigate to Title" "Down" "TITLE" 2

# Test 7: Navigate to Description
run_test "Navigate to Description" "Down" "DESCRIPTION" 2

# Test 8: Navigate to Add Comment
run_test "Navigate to ADD COMMENT" "Down" "ADD COMMENT" 2

# Test 9: Enter Add Comment mode
run_test "Enter Add Comment Mode" "Enter" "Add Comment" 2

# Test 10: Comment mode shows save hint
check_state "Comment Mode - Save Hint" "Enter: Save"

# Test 11: Cancel with Escape key and then Escape to go back to menu
sleep 1
run_test "Cancel Edit (Escape key)" "Escape" "Navigate" 3
run_test "Back to Jira Menu (Escape)" "Escape" "Browse All Tickets" 3

# Test 13: Open ticket and test Edit Title mode (need to enter browse mode first)
run_test "Enter Browse Mode" "Enter" "Recent Tickets" 3
run_test "Re-enter Ticket Detail" "Enter" "STATUS" 3
run_test "Navigate to Title for Edit" "Down" "TITLE" 1

# Test 14: Enter Edit Title mode
run_test "Enter Edit Title Mode" "Enter" "✎ Edit Title" 1

# Test 15: Edit mode shows current title text
OUTPUT=$(tmux capture-pane -t $SESSION -p)
if echo "$OUTPUT" | grep -q "Enter: Save"; then
    log "${GREEN}✓ PASS${NC}: Edit Title Mode - Shows Cursor"
    ((PASS_COUNT++))
else
    log "${RED}✗ FAIL${NC}: Edit Title Mode - Shows Cursor"
    ((FAIL_COUNT++))
fi

# Test 16: Back to view mode
run_test "Cancel Edit Title (Escape key)" "Escape" "TITLE" 2
run_test "Back to Jira Menu from Detail" "Escape" "Browse All Tickets" 2

# Test 17: Navigate and test Edit Description
run_test "Enter Browse Mode Again" "Enter" "Recent Tickets" 3
run_test "Open Ticket for Description Test" "Enter" "TITLE" 4
run_test "Navigate to Description for Edit" "Down Down" "DESCRIPTION" 2
run_test "Enter Edit Description Mode" "Enter" "Edit Description" 2

run_test "Cancel Edit Description (Escape key)" "Escape" "DESCRIPTION" 2
run_test "Back to Jira Menu from Description" "Escape" "Search Tickets" 2

# Test: Search Tickets (Updated Logic)
# 1. Enter Search Mode
run_test "Enter Search Mode" "Down Enter" "Search Jira Tickets" 2
# 2. Type "SAM" Query and wait for results
run_test "Type Query 'SAM'" "SAM" "SAM" 3
# 3. Back to menu (search result selection is API-dependent, so just verify search UI works)
run_test "Back from Search (Escape)" "Escape" "Browse All Tickets" 2


# ============================================
# CONFLUENCE TESTS
# ============================================
log "\n─────────────────────────────────────────────────────────────────"
log "CONFLUENCE TESTS"
log "─────────────────────────────────────────────────────────────────"

# Test: Switch to Confluence tab
run_test "Tab Switch to Confluence" "Tab" "Confluence" 2

# Test: Confluence menu visible
check_state "Confluence Menu Visible" "Browse All Pages"

# Test: Browse pages
run_test "Browse All Pages" "Enter" "Recent Pages" 3

# Test: Select a page and view content (inline editor mode)
run_test "View Page Content" "Enter" "Ln" 4

# Test: Inline Editor - Cursor visible (status bar shows line/col)
check_state "Editor - Cursor Status Bar" "Ln 1, Col"

# Test: Inline Editor - Save hint visible
check_state "Editor - Save Hint" "Ctrl+S: Save"

# Test: Arrow key cursor movement
run_test "Editor - Arrow Down" "Down" "Ln 2" 1
run_test "Editor - Arrow Right" "Right Right Right" "Col" 1

# Test: Text input (type some characters)
run_test "Editor - Type Text" "test" "test" 2

# Test: Unsaved changes indicator
check_state "Editor - Unsaved Changes" "unsaved"

# Note: Mouse click positioning requires manual testing
# (tmux cannot simulate mouse click events)

# Test: Back to list (Escape)
run_test "Back to Page List (Escape)" "Escape" "Browse All Pages" 2

# Test: Search Pages (New Logic)
run_test "Enter Search Pages" "Down Enter" "Search Confluence Pages" 2
run_test "Search Query 'Welcome'" "Welcome" "Welcome" 2
run_test "Back from Search (Escape)" "Escape" "Browse All Pages" 2

# ============================================
# APP CONTROLS TESTS
# ============================================
log "\n─────────────────────────────────────────────────────────────────"
log "APP CONTROLS"
log "─────────────────────────────────────────────────────────────────"

# Test: Tab back to Jira
run_test "Tab Switch Back to Jira" "Tab" "Jira" 2

# Test: Quit (this should close the app)
log "${CYAN}Testing quit functionality...${NC}"
tmux send-keys -t $SESSION "C-q"
sleep 2

# Check if session is still active (should not be if quit worked)
if tmux has-session -t $SESSION 2>/dev/null; then
    # Session still exists, check if app exited
    OUTPUT=$(tmux capture-pane -t $SESSION -p)
    if echo "$OUTPUT" | grep -qi "exit" || [ -z "$(echo "$OUTPUT" | grep -v '^$')" ]; then
        log "${GREEN}✓ PASS${NC}: Quit (Ctrl+Q) - App exited"
        ((PASS_COUNT++))
    else
        log "${RED}✗ FAIL${NC}: Quit (Ctrl+Q) - App still running"
        ((FAIL_COUNT++))
    fi
else
    log "${GREEN}✓ PASS${NC}: Quit (Ctrl+Q) - App exited"
    ((PASS_COUNT++))
fi

# Cleanup
cleanup

# Summary
TOTAL=$((PASS_COUNT + FAIL_COUNT + SKIP_COUNT))
echo ""
log "═══════════════════════════════════════════════════════════════"
log "                      TEST SUMMARY                              "
log "═══════════════════════════════════════════════════════════════"
log "PASSED: ${GREEN}$PASS_COUNT${NC}"
log "FAILED: ${RED}$FAIL_COUNT${NC}"
log "SKIPPED: ${YELLOW}$SKIP_COUNT${NC}"
log "TOTAL: $TOTAL"
echo ""

if [ $FAIL_COUNT -eq 0 ]; then
    log "${GREEN}All tests passed! 🎉${NC}"
    exit 0
else
    log "${RED}Some tests failed. Check log: $LOG_FILE${NC}"
    exit 1
fi
