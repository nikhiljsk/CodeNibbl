/**
 * ============================================================================
 * CodeNibbl — Sidebar Webview Provider (`src/webview/nibblSidebarProvider.ts`)
 * ============================================================================
 * Bridges the VS Code Sidebar Webview with the Async Nibbl Generator:
 * - Maintains a live TikTok-style session `deck` of pre-cooked cards.
 * - Streams newly cooked cards into the active feed via `postMessage` (`APPEND_CARD`)
 *   without resetting scroll state or flickering the Webview.
 * - Strictly distinguishes `cooking`, `all_seen`, `no_workspace`, and `needs_model`
 *   so loading NEVER falsely flashes the "Connect a Model" screen!
 * - Enforces `validateWebviewMessage()`, `resolveSafeWorkspaceFilePath()`,
 *   and `isSafeSponsorUrl()` on all incoming actions.
 */

import * as fs from 'fs';
import * as vscode from 'vscode';
import { NibblGenerator } from '../engine/nibblGenerator';
import { SeenLedger } from '../engine/seenLedger';
import {
  buildWebviewHtml,
  formatFlexCardMarkdown,
  WebviewEmptyState,
} from './webviewHtml';
import { MASCOT_LABELS_BY_MOOD } from './mascotAssets';
import { renderMermaidToSvg } from './mermaidRenderer';
import {
  isSafeSponsorUrl,
  resolveSafeWorkspaceFilePath,
  validateWebviewMessage,
} from '../security/pathValidator';
import { NibblCard, VibeMode, WebviewOutgoingMessage } from '../types';

const MAX_SESSION_DECK = 50;

export class NibblSidebarProvider implements vscode.WebviewViewProvider {
  public static readonly viewType = 'codenibbl.feedView';
  private view?: vscode.WebviewView;
  private deck: NibblCard[] = [];
  private isBatchCooking = false;
  private allSeen = false;
  private lastErrorHint?: string;

  constructor(
    private readonly extensionUri: vscode.Uri,
    private readonly generator: NibblGenerator,
    private readonly seenLedger: SeenLedger,
    private readonly onRequestCook?: () => void,
    private readonly checkModelConfigured?: () => Promise<boolean>
  ) {}

  public hasDisplayedCard(): boolean {
    return this.deck.length > 0;
  }

  public clearSessionDeck(): void {
    this.deck = [];
    this.allSeen = false;
    this.lastErrorHint = undefined;
  }

  /**
   * Updates live cooking status without reloading the full Webview if cards are
   * already mounted; otherwise refreshes the empty-state screen accurately.
   */
  public notifyCookingStatus(params: {
    isCooking: boolean;
    allSeen?: boolean;
    errorHint?: string;
  }): void {
    this.isBatchCooking = params.isCooking;
    if (params.allSeen !== undefined) {
      this.allSeen = params.allSeen;
    }
    if (params.errorHint !== undefined) {
      this.lastErrorHint = params.errorHint || undefined;
    }

    if (!this.view) {
      return;
    }

    if (this.deck.length > 0) {
      const msg: WebviewOutgoingMessage = {
        type: 'COOKING_STATUS',
        isCooking: this.isBatchCooking || this.generator.getIsCooking(),
        allSeen: this.allSeen,
        errorHint: this.lastErrorHint,
      };
      void this.view.webview.postMessage(msg);
    } else {
      void this.renderCurrentCard(false);
    }
  }

  /**
   * Drains newly cooked cards from `generator` into the live TikTok deck.
   * If the feed is already open, appends them seamlessly via `postMessage`!
   */
  public absorbCookedCards(isStillCooking: boolean): void {
    this.isBatchCooking = isStillCooking;
    this.lastErrorHint = undefined;
    this.allSeen = false;

    const wasEmpty = this.deck.length === 0;
    const newlyPopped: NibblCard[] = [];

    let next = this.generator.popNextCard();
    while (next) {
      newlyPopped.push(next);
      this.deck.push(next);
      if (this.deck.length > MAX_SESSION_DECK) {
        this.deck.shift();
      }
      next = this.generator.popNextCard();
    }

    if (!this.view || newlyPopped.length === 0) {
      return;
    }

    if (wasEmpty) {
      // Transition from empty Cooking shimmer screen into the live TikTok deck!
      void this.renderCurrentCard(false);
      return;
    }

    // Stream each new card directly into the existing snap-scroll DOM!
    for (const card of newlyPopped) {
      const msg: WebviewOutgoingMessage = {
        type: 'APPEND_CARD',
        card,
        renderedMermaidSvg: card.mermaidDiagram
          ? renderMermaidToSvg(card.mermaidDiagram)
          : null,
        flexMarkdown: formatFlexCardMarkdown(card),
        mascotLabel: MASCOT_LABELS_BY_MOOD[card.mascotMood] ?? '',
        customMascotUri: this.resolveCustomMascotUri(card),
        isCooking: isStillCooking || this.generator.getIsCooking(),
      };
      void this.view.webview.postMessage(msg);
    }
  }

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

    // Paint initial HTML synchronously in <5ms so the sidebar is NEVER blank,
    // even while VS Code startup tasks or OS Keychain reads are still pending!
    const config = vscode.workspace.getConfiguration('codenibbl');
    const vibeMode = config.get<VibeMode>('vibeMode', 'genz_hype');
    const provider = config.get<string>('provider', 'vscode-lm');
    const hasWorkspace = Boolean(vscode.workspace.workspaceFolders?.length);

    let next = this.generator.popNextCard();
    while (next) {
      this.deck.push(next);
      if (this.deck.length > MAX_SESSION_DECK) {
        this.deck.shift();
      }
      next = this.generator.popNextCard();
    }

    webviewView.webview.html = buildWebviewHtml({
      cspSource: webviewView.webview.cspSource,
      cards: this.deck,
      isCooking: hasWorkspace && this.deck.length === 0,
      emptyState: hasWorkspace ? 'cooking' : 'no_workspace',
      vibeMode,
      providerLabel: provider,
      stats: this.seenLedger.getState().stats,
      customMascotUri: this.deck[0] ? this.resolveCustomMascotUri(this.deck[0]) : undefined,
    });

    // Asynchronously verify model configuration & start background cooking
    void this.renderCurrentCard(false);

    webviewView.webview.onDidReceiveMessage(async (rawMsg: unknown) => {
      const msg = validateWebviewMessage(rawMsg);
      if (!msg) {
        return;
      }

      switch (msg.type) {
        case 'SPIN_NEXT_NIBBL':
        case 'REQUEST_MORE_CARDS': {
          this.lastErrorHint = undefined;
          // Drain any waiting cards first
          this.absorbCookedCards(this.isBatchCooking);
          if (this.onRequestCook) {
            this.notifyCookingStatus({ isCooking: true, allSeen: false });
            this.onRequestCook();
          }
          break;
        }

        case 'RESET_SEEN_HISTORY':
          await vscode.commands.executeCommand('codenibbl.clearSeenLedger');
          break;

        case 'OPEN_FOLDER':
          await vscode.commands.executeCommand('workbench.action.files.openFolder');
          break;

        case 'CONFIGURE_MODEL':
          await vscode.commands.executeCommand('codenibbl.configureModel');
          this.lastErrorHint = undefined;
          await this.renderCurrentCard(false);
          break;

        case 'SWITCH_VIBE': {
          const config = vscode.workspace.getConfiguration('codenibbl');
          await config.update('vibeMode', msg.vibeMode, vscode.ConfigurationTarget.Global);
          await this.renderCurrentCard(false);
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

  public async renderCurrentCard(drainQueue = true): Promise<void> {
    if (!this.view) {
      return;
    }

    const config = vscode.workspace.getConfiguration('codenibbl');
    const vibeMode = config.get<VibeMode>('vibeMode', 'genz_hype');
    const provider = config.get<string>('provider', 'vscode-lm');
    const hasWorkspace = Boolean(vscode.workspace.workspaceFolders?.length);

    let emptyState: WebviewEmptyState | undefined;

    if (!hasWorkspace) {
      this.deck = [];
      emptyState = 'no_workspace';
    } else {
      if (drainQueue) {
        let next = this.generator.popNextCard();
        while (next) {
          this.deck.push(next);
          if (this.deck.length > MAX_SESSION_DECK) {
            this.deck.shift();
          }
          next = this.generator.popNextCard();
        }
      }

      if (this.deck.length === 0) {
        const modelConfigured = this.checkModelConfigured
          ? await this.checkModelConfigured()
          : true;

        if (!modelConfigured || this.lastErrorHint) {
          emptyState = 'needs_model';
        } else if (this.allSeen && !this.isBatchCooking && !this.generator.getIsCooking()) {
          emptyState = 'all_seen';
        } else {
          // Model IS configured — show clear Cooking shimmer loader instead of "Connect Model"!
          emptyState = 'cooking';
          if (!this.isBatchCooking && !this.generator.getIsCooking() && this.onRequestCook) {
            this.isBatchCooking = true;
            const trigger = this.onRequestCook;
            setTimeout(() => trigger(), 0);
          }
        }
      } else if (this.allSeen) {
        emptyState = 'all_seen';
      }
    }

    const firstCard = this.deck[0] ?? null;
    const customMascotUri = firstCard ? this.resolveCustomMascotUri(firstCard) : undefined;

    this.view.webview.html = buildWebviewHtml({
      cspSource: this.view.webview.cspSource,
      cards: this.deck,
      isCooking: this.isBatchCooking || this.generator.getIsCooking(),
      errorHint: this.lastErrorHint,
      emptyState,
      vibeMode,
      providerLabel: provider,
      stats: this.seenLedger.getState().stats,
      customMascotUri,
    });
  }

  private resolveCustomMascotUri(card: NibblCard): string | undefined {
    if (!this.view) {
      return undefined;
    }
    try {
      const mascotFileName = `${card.mascotMood}.svg`;
      const customMascotDiskPath = vscode.Uri.joinPath(
        this.extensionUri,
        'media',
        'mascot',
        mascotFileName
      ).fsPath;

      if (fs.existsSync(customMascotDiskPath)) {
        return this.view.webview
          .asWebviewUri(
            vscode.Uri.joinPath(this.extensionUri, 'media', 'mascot', mascotFileName)
          )
          .toString();
      }
    } catch {
      return undefined;
    }
    return undefined;
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
