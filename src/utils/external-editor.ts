import { spawn, execSync } from 'child_process';
import { writeFileSync, readFileSync, unlinkSync, existsSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';

const GUI_EDITOR_CANDIDATES = ['cursor --wait', 'code --wait', 'code-insiders --wait'];
const TERMINAL_EDITORS = new Set(['vim', 'vi', 'nvim', 'nano', 'emacs', 'hx', 'kak']);

export interface ExternalEditorOptions {
    /** Initial content to edit */
    content: string;
    /** File extension for temp file (e.g., 'md', 'txt') */
    extension?: string;
    /** Custom editor command (defaults to GUI editor like Cursor/VS Code) */
    editor?: string;
}

export interface ExternalEditorResult {
    /** Whether the edit was successful */
    success: boolean;
    /** The edited content (if successful) */
    content?: string;
    /** Error message (if failed) */
    error?: string;
    /** Whether file was modified */
    modified: boolean;
}

/**
 * Opens content in an external editor and returns the edited result.
 * Prefers GUI editors (Cursor/VS Code) for a smoother TUI workflow.
 */
export async function openExternalEditor(
    options: ExternalEditorOptions
): Promise<ExternalEditorResult> {
    const { content, extension = 'md' } = options;

    // Determine editor command
    const editor = options.editor || getDefaultEditor();
    if (!editor) {
        return {
            success: false,
            error: 'No supported GUI editor found. Install Cursor or VS Code and enable the shell command.',
            modified: false,
        };
    }

    // Create temp file
    const tempPath = join(tmpdir(), `confluence-edit-${Date.now()}.${extension}`);

    const stdin = process.stdin as NodeJS.ReadStream & {
        isRaw?: boolean;
        setRawMode?: (mode: boolean) => void;
    };
    const canManageStdin = Boolean(stdin && stdin.isTTY && stdin.setRawMode);
    const wasRaw = Boolean(canManageStdin && stdin.isRaw);
    const wasPaused = Boolean(stdin && stdin.isPaused && stdin.isPaused());
    const flushStdinBuffer = () => {
        if (!stdin || typeof stdin.read !== 'function') return;
        let chunk = stdin.read();
        while (chunk !== null) {
            chunk = stdin.read();
        }
    };

    try {
        // Write initial content
        writeFileSync(tempPath, content, 'utf-8');
        const originalContent = content;

        // Reset terminal state before opening editor
        // Disable mouse tracking modes that might interfere with vim
        process.stdout.write('\x1b[?1000l\x1b[?1002l\x1b[?1003l\x1b[?1006l');
        // Reset cursor and clear screen for clean handoff
        process.stdout.write('\x1b[?25h'); // Show cursor

        // Temporarily hand stdin control to the external editor.
        // This prevents Ink input handlers from processing editor keystrokes.
        if (canManageStdin) {
            stdin.setRawMode?.(false);
        }
        if (stdin && !wasPaused) {
            stdin.pause();
        }

        // Open editor and wait for it to close
        await openEditor(editor, tempPath);

        // Restore terminal state after editor closes
        // Re-enable raw mode for Ink and let components re-enable mouse tracking.
        flushStdinBuffer();
        if (stdin && !wasPaused) {
            stdin.resume();
        }
        flushStdinBuffer();
        if (canManageStdin && wasRaw) {
            stdin.setRawMode?.(true);
        }
        process.stdout.write('\x1b[2J\x1b[H\x1b[?25l'); // Clear/home and hide cursor for Ink

        // Read back the content
        if (!existsSync(tempPath)) {
            return {
                success: false,
                error: 'Temp file was deleted',
                modified: false,
            };
        }

        const editedContent = readFileSync(tempPath, 'utf-8');
        const modified = editedContent !== originalContent;

        // Clean up
        try {
            unlinkSync(tempPath);
        } catch {
            // Ignore cleanup errors
        }

        return {
            success: true,
            content: editedContent,
            modified,
        };
    } catch (error) {
        // Clean up on error
        try {
            if (existsSync(tempPath)) {
                unlinkSync(tempPath);
            }
        } catch {
            // Ignore cleanup errors
        }

        // Ensure terminal input mode is restored even if editor launch fails.
        if (stdin && !wasPaused) {
            stdin.resume();
        }
        flushStdinBuffer();
        if (canManageStdin && wasRaw) {
            stdin.setRawMode?.(true);
        }

        return {
            success: false,
            error: error instanceof Error ? error.message : 'Unknown error',
            modified: false,
        };
    }
}

/**
 * Gets the default editor from environment
 */
function getDefaultEditor(): string {
    const envEditor = process.env.EDITOR || process.env.VISUAL;
    const preferredGui = GUI_EDITOR_CANDIDATES.find(candidate =>
        commandExists(getCommandName(candidate))
    );

    if (envEditor) {
        const envCmd = getCommandName(envEditor);
        const isTerminalEditor = TERMINAL_EDITORS.has(envCmd);

        // Respect non-terminal custom editors from env when available.
        if (!isTerminalEditor && commandExists(envCmd)) {
            return envEditor;
        }

        // For terminal defaults like vim/nano, prefer a GUI editor for Ctrl+E.
        if (preferredGui) {
            return preferredGui;
        }

        // Explicitly avoid terminal editors for Ctrl+E workflow.
        if (isTerminalEditor) {
            return '';
        }
    }

    if (preferredGui) {
        return preferredGui;
    }

    return '';
}

function getCommandName(editor: string): string {
    return editor.trim().split(/\s+/)[0] || '';
}

function commandExists(cmd: string): boolean {
    if (!cmd || !/^[A-Za-z0-9._-]+$/.test(cmd)) return false;
    try {
        execSync(`command -v ${cmd}`, { stdio: 'ignore' });
        return true;
    } catch {
        return false;
    }
}

/**
 * Opens the editor and waits for it to close
 */
function openEditor(editor: string, filePath: string): Promise<void> {
    return new Promise((resolve, reject) => {
        const parts = editor.split(' ');
        const cmd = parts[0];
        const args = [...parts.slice(1), filePath];

        const proc = spawn(cmd, args, {
            stdio: 'inherit',
            shell: true,
        });

        proc.on('error', (error) => {
            reject(new Error(`Failed to open editor: ${error.message}`));
        });

        proc.on('close', (code) => {
            if (code === 0) {
                resolve();
            } else {
                reject(new Error(`Editor exited with code ${code}`));
            }
        });
    });
}

/**
 * Check if an editor is available
 */
export function isEditorAvailable(): boolean {
    const editor = getDefaultEditor();
    return commandExists(getCommandName(editor));
}

/**
 * Get the name of the configured editor
 */
export function getEditorName(): string {
    const editor = getDefaultEditor();
    return getCommandName(editor);
}
