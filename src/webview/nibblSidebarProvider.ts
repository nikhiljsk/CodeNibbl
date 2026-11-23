/**
 * ============================================================================
 * CodeNibbl — Sidebar Webview Provider (`src/webview/nibblSidebarProvider.ts`)
 * ============================================================================
 * Bridges the VS Code Sidebar Webview with the Async Nibbl Generator and
 * enforces strict security checks on every incoming Webview message:
 * - `validateWebviewMessage()` on all `onDidReceiveMessage` events.
 * - `resolveSafeWorkspaceFilePath()` before opening any file in the editor.
 * - `isSafeSponsorUrl()` before opening external Sponsor links.
 * - Custom Mascot Asset loader from `media/mascot/<mood>.svg`.
 */

import * as fs from 'fs';
import * as vscode from 'vscode';
import { NibblGenerator } from '../engine/nibblGenerator';
import { SeenLedger } from '../engine/seenLedger';
import { buildWebviewHtml } from './webviewHtml';
import {
  isSafeSponsorUrl,
  resolveSafeWorkspaceFilePath,
  validateWebviewMessage,
} from '../security/pathValidator';
import { VibeMode } from '../types';

export class NibblSidebarProvider implements vscode.WebviewViewProvider {
  public static readonly viewType = 'codenibbl.feedView';
  private view?: vscode.WebviewView;

  constructor(
    private readonly extensionUri: vscode.Uri,
    private readonly generator: NibblGenerator,
    private readonly seenLedger: SeenLedger
  ) {}

  public resolveWebviewView(
    webviewView: vscode.WebviewView,
    _context: vscode.WebviewViewResolveContext,
    _token: vscode.CancellationToken
  ): void {
    this.view = webviewView;

    webviewView.webview.options = {
      enableScripts: true,
      localResourceRoots: [vscode.Uri.joinPath(this.extensionUri, 'media')],
    };

    this.renderCurrentCard();

    webviewView.webview.onDidReceiveMessage(async (rawMsg: unknown) => {
      const msg = validateWebviewMessage(rawMsg);
      if (!msg) {
        return;
      }

      switch (msg.type) {
        case 'SPIN_NEXT_NIBBL':
          this.renderCurrentCard();
          break;

        case 'CONFIGURE_MODEL':
          await vscode.commands.executeCommand('codenibbl.configureModel');
          this.renderCurrentCard();
          break;

        case 'SWITCH_VIBE': {
          const config = vscode.workspace.getConfiguration('codenibbl');
          await config.update('vibeMode', msg.vibeMode, vscode.ConfigurationTarget.Global);
          this.renderCurrentCard();
          break;
        }

        case 'QUIZ_SOLVED':
          this.seenLedger.recordQuizSolved();
          break;

        case 'JUMP_TO_CODE':
          await this.safeJumpToCode(msg.filePath, msg.line, msg.endLine);
          break;

        case 'FLEX_CARD_COPY':
          await vscode.env.clipboard.writeText(msg.markdown);
          vscode.window.showInformationMessage(
            '📋 CodeNibbl card copied to clipboard! Ready to flex in Slack/Discord/X 🔥'
          );
          break;

        case 'GITHUB_SPONSORS':
          await vscode.commands.executeCommand('codenibbl.githubSponsors');
          break;

        case 'BUY_ME_A_COFFEE':
          await vscode.commands.executeCommand('codenibbl.buyMeACoffee');
          break;
      }
    });
  }

  public renderCurrentCard(): void {
    if (!this.view) {
      return;
    }
    const config = vscode.workspace.getConfiguration('codenibbl');
    const vibeMode = config.get<VibeMode>('vibeMode', 'genz_hype');
    const provider = config.get<string>('provider', 'vscode-lm');
    const card = this.generator.popNextCard();

    // Check if custom mascot art exists in media/mascot/<mood>.svg
    let customMascotUri: string | undefined;
    try {
      const mascotFileName = `${card.mascotMood}.svg`;
      const customMascotDiskPath = vscode.Uri.joinPath(
        this.extensionUri,
        'media',
        'mascot',
        mascotFileName
      ).fsPath;

      if (fs.existsSync(customMascotDiskPath)) {
        customMascotUri = this.view.webview
          .asWebviewUri(
            vscode.Uri.joinPath(this.extensionUri, 'media', 'mascot', mascotFileName)
          )
          .toString();
      }
    } catch {
      customMascotUri = undefined;
    }

    this.view.webview.html = buildWebviewHtml({
      cspSource: this.view.webview.cspSource,
      initialCard: card,
      vibeMode,
      providerLabel: provider,
      stats: this.seenLedger.getState().stats,
      customMascotUri,
    });
  }

  /**
   * Safely opens a workspace file and scrolls to the exact line range.
   * Rejects any path traversal attempt outside the active workspace folder.
   */
  private async safeJumpToCode(
    relativePath: string,
    startLine: number,
    endLine?: number
  ): Promise<void> {
    const folder = vscode.workspace.workspaceFolders?.[0];
    if (!folder) {
      return;
    }

    const safeAbsolutePath = resolveSafeWorkspaceFilePath(
      folder.uri.fsPath,
      relativePath
    );
    if (!safeAbsolutePath) {
      vscode.window.showWarningMessage(
        '🛡️ CodeNibbl Security blocked an invalid or out-of-workspace file link.'
      );
      return;
    }

    try {
      const doc = await vscode.workspace.openTextDocument(vscode.Uri.file(safeAbsolutePath));
      const startZero = Math.max(0, startLine - 1);
      const endZero = Math.max(startZero, (endLine ?? startLine) - 1);
      const range = new vscode.Range(startZero, 0, endZero, 200);

      const editor = await vscode.window.showTextDocument(doc, {
        selection: range,
        preview: true,
      });
      editor.revealRange(range, vscode.TextEditorRevealType.InCenter);
    } catch {
      vscode.window.showInformationMessage(`Could not open ${relativePath}.`);
    }
  }

  public static async openGitHubSponsorsUrl(): Promise<void> {
    const config = vscode.workspace.getConfiguration('codenibbl');
    const url = config.get<string>('githubSponsorsUrl', 'https://github.com/sponsors/nikhiljsk');

    if (!isSafeSponsorUrl(url)) {
      vscode.window.showWarningMessage(
        '🛡️ Sponsor URL must be a valid HTTPS link on buymeacoffee.com, github.com, or ko-fi.com.'
      );
      return;
    }

    await vscode.env.openExternal(vscode.Uri.parse(url));
  }

  public static async openSponsorUrl(): Promise<void> {
    const config = vscode.workspace.getConfiguration('codenibbl');
    const url = config.get<string>('sponsorUrl', 'https://buymeacoffee.com/nikhiljsk');

    if (!isSafeSponsorUrl(url)) {
      vscode.window.showWarningMessage(
        '🛡️ Sponsor URL must be a valid HTTPS link on buymeacoffee.com, github.com, or ko-fi.com.'
      );
      return;
    }

    await vscode.env.openExternal(vscode.Uri.parse(url));
  }
}
