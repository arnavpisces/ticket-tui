import { execSync, spawnSync } from 'child_process';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

/**
 * Renders Markdown using Glow CLI for beautiful terminal output.
 * Glow provides better rendering than in-process solutions, including:
 * - Proper table formatting
 * - Syntax highlighting for code blocks
 * - Better list handling
 * - Consistent styling
 */
export class GlowRenderer {
    private glowPath: string | null = null;
    private available: boolean | null = null;

    constructor() {
        this.detectGlow();
    }

    /**
     * Check if glow is available on the system
     */
    private detectGlow(): void {
        try {
            const result = spawnSync('which', ['glow'], {
                encoding: 'utf-8',
                timeout: 2000,
            });
            if (result.status === 0 && result.stdout.trim()) {
                this.glowPath = result.stdout.trim();
                this.available = true;
            } else {
                this.available = false;
            }
        } catch {
            this.available = false;
        }
    }

    /**
     * Check if glow is available
     */
    isAvailable(): boolean {
        return this.available === true;
    }

    /**
     * Get installation instructions
     */
    getInstallInstructions(): string {
        return 'Install glow: brew install glow (macOS) or go install github.com/charmbracelet/glow@latest';
    }

    /**
     * Render markdown to styled terminal output using glow
     */
    render(markdown: string, width?: number): string {
        if (!this.available || !this.glowPath) {
            // Fallback to plain text if glow is not available
            return markdown;
        }

        // Create temp file for markdown content
        const tmpDir = os.tmpdir();
        const tmpFile = path.join(tmpDir, `sutra-${Date.now()}.md`);

        try {
            // Write markdown to temp file
            fs.writeFileSync(tmpFile, markdown, 'utf-8');

            // Get terminal width or use provided width
            const termWidth = width || process.stdout.columns || 80;

            // Call glow to render
            const result = execSync(
                `"${this.glowPath}" --style auto --width ${termWidth - 4} "${tmpFile}"`,
                {
                    encoding: 'utf-8',
                    timeout: 5000,
                    maxBuffer: 10 * 1024 * 1024, // 10MB buffer for large docs
                }
            );

            // If glow returns almost nothing, fallback to plain markdown
            // This can happen when glow has issues with certain content
            if (result.trim().length < 10 && markdown.length > 10) {
                return markdown;
            }

            return result;
        } catch (error) {
            // On error, return plain markdown
            console.error('Glow render error:', error);
            return markdown;
        } finally {
            // Clean up temp file
            try {
                fs.unlinkSync(tmpFile);
            } catch {
                // Ignore cleanup errors
            }
        }
    }

    /**
     * Render with a specific style theme
     */
    renderWithStyle(
        markdown: string,
        style: 'dark' | 'light' | 'notty' | 'auto' = 'auto',
        width?: number
    ): string {
        if (!this.available || !this.glowPath) {
            return markdown;
        }

        const tmpDir = os.tmpdir();
        const tmpFile = path.join(tmpDir, `sutra-${Date.now()}.md`);

        try {
            fs.writeFileSync(tmpFile, markdown, 'utf-8');
            const termWidth = width || process.stdout.columns || 80;

            const result = execSync(
                `"${this.glowPath}" --style ${style} --width ${termWidth - 4} "${tmpFile}"`,
                {
                    encoding: 'utf-8',
                    timeout: 5000,
                    maxBuffer: 10 * 1024 * 1024,
                }
            );

            return result;
        } catch {
            return markdown;
        } finally {
            try {
                fs.unlinkSync(tmpFile);
            } catch {
                // Ignore cleanup errors
            }
        }
    }
}

// Singleton instance
export const glowRenderer = new GlowRenderer();

/**
 * Simple helper function for quick rendering
 */
export function renderMarkdownWithGlow(markdown: string): string {
    return glowRenderer.render(markdown);
}
