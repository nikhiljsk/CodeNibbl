/**
 * ============================================================================
 * CodeNibbl 🐹🌶️ — Main VS Code Extension Entry Point (`src/extension.ts`)
 * ============================================================================
 * Registers:
 * 1. OS Keychain `SecretManager` (`context.secrets`)
 * 2. 6-Layer `SeenLedger` persisted in `context.workspaceState`
 * 3. `UniversalLLMRouter` supporting OpenAI, Anthropic, Gemini, xAI, Ollama, & `vscode.lm`
 * 4. `NibblGenerator` & `NibblSidebarProvider`
 * 5. Async background queue top-up loop (`topUpQueueAsync`)
 * 6. Agent Wait-Time Auto-Popup (`onDidStartTerminalShellExecution`)
 * 7. Fresh-Diff watcher on file save (`onDidSaveTextDocument`)
 * 8. Status Bar item & Commands
 */

import * as path from 'path';
import * as vscode from 'vscode';
import { SecretManager } from './config/secretManager';
import { SeenLedger } from './engine/seenLedger';
import { NibblGenerator } from './engine/nibblGenerator';
import { UniversalLLMRouter } from './llm/universalRouter';
import { NibblSidebarProvider } from './webview/nibblSidebarProvider';
import {
  CandidateSymbol,
  LLMProviderType,
  SeenLedgerState,
  VibeMode,
} from './types';
import {
  chunkFileByRegex,
  createSafeCandidateSymbol,
  detectLanguageFromPath,
  harvestWorkspaceSymbols,
  isMundaneBoilerplate,
} from './harvester/spiceHarvester';
import { isSensitiveFilePath } from './security/secretScrubber';

const LEDGER_STORAGE_KEY = 'codenibbl.seenLedger.v1';

export function activate(context: vscode.ExtensionContext): void {
  const secretManager = new SecretManager(context.secrets);

  const savedLedger = context.workspaceState.get<SeenLedgerState>(LEDGER_STORAGE_KEY);
  const seenLedger = new SeenLedger(savedLedger);

  let cachedCandidates: CandidateSymbol[] = [];
  let isRefreshingCandidates = false;
  let isToppingUp = false;

  const llmRouter = new UniversalLLMRouter(
    async () => {
      const cfg = vscode.workspace.getConfiguration('codenibbl');
      const provider = cfg.get<LLMProviderType>('provider', 'vscode-lm');
      const modelId = cfg.get<string>('modelId', 'gpt-4o-mini');
      const customBaseUrl = cfg.get<string>('customBaseUrl', '');
      const apiKey = await secretManager.getApiKey(provider);
      return { provider, modelId, apiKey, customBaseUrl };
    },
    async (systemPrompt: string, userPrompt: string) => {
      const models = await vscode.lm.selectChatModels({});
      const model = models[0];
      if (!model) {
        throw new Error('No native VS Code chat model available. Connect an API key via CodeNibbl.');
      }
      const messages = [
        vscode.LanguageModelChatMessage.User(`${systemPrompt}\n\n${userPrompt}`),
      ];
      const response = await model.sendRequest(messages, {});
      let text = '';
      for await (const chunk of response.text) {
        text += chunk;
      }
      return text;
    }
  );

  const generator = new NibblGenerator(seenLedger, llmRouter);
  const sidebarProvider = new NibblSidebarProvider(
    context.extensionUri,
    generator,
    seenLedger,
    () => {
      void topUpQueueAsync();
    }
  );

  async function refreshCandidates(): Promise<CandidateSymbol[]> {
    if (!vscode.workspace.workspaceFolders?.length) {
      cachedCandidates = [];
      return cachedCandidates;
    }
    if (isRefreshingCandidates) {
      return cachedCandidates;
    }
    isRefreshingCandidates = true;
    try {
      cachedCandidates = await harvestWorkspaceSymbols();
    } catch {
      // Continue with whatever candidates we have
    } finally {
      isRefreshingCandidates = false;
    }
    return cachedCandidates;
  }

  /**
   * Non-blocking background queue top-up loop.
   * Pre-cooks Nibbl cards until queue depth reaches `codenibbl.preCookedQueueSize`.
   */
  async function topUpQueueAsync(): Promise<void> {
    if (!vscode.workspace.workspaceFolders?.length || isToppingUp) {
      return;
    }
    isToppingUp = true;
    try {
      const config = vscode.workspace.getConfiguration('codenibbl');
      const targetSize = config.get<number>('preCookedQueueSize', 5);
      const vibeMode = config.get<VibeMode>('vibeMode', 'genz_hype');

      if (cachedCandidates.length === 0) {
        await refreshCandidates();
      }

      while (generator.getQueueDepth() < targetSize && cachedCandidates.length > 0) {
        const card = await generator.cookNextCardAsync(cachedCandidates, vibeMode);
        if (!card) {
          break;
        }
        await context.workspaceState.update(LEDGER_STORAGE_KEY, seenLedger.getState());
        if (!sidebarProvider.hasDisplayedCard()) {
          sidebarProvider.renderCurrentCard(true);
        }
        // Small pacing delay to avoid aggressive rate-limiting
        await new Promise((r) => setTimeout(r, 600));
      }
    } catch {
      // Non-blocking: background loop fails silently without interrupting the editor
    } finally {
      isToppingUp = false;
    }
  }

  context.subscriptions.push(
    vscode.window.registerWebviewViewProvider(
      NibblSidebarProvider.viewType,
      sidebarProvider,
      { webviewOptions: { retainContextWhenHidden: true } }
    )
  );

  // Status Bar Item
  const statusBar = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 100);
  statusBar.text = '$(flame) CodeNibbl 🌶️';
  statusBar.tooltip = 'Snack on spicy codebase lore while your AI cooks!';
  statusBar.command = 'codenibbl.spinRandomNibbl';
  statusBar.show();
  context.subscriptions.push(statusBar);

  // Agent Wait-Time Auto-Popup Listener
  let agentWaitTimer: NodeJS.Timeout | undefined;
  let activeExecutionsCount = 0;

  if ('onDidStartTerminalShellExecution' in vscode.window) {
    context.subscriptions.push(
      (vscode.window as any).onDidStartTerminalShellExecution((_e: any) => {
        activeExecutionsCount++;
        const config = vscode.workspace.getConfiguration('codenibbl');
        const autoPopup = config.get<boolean>('autoPopupOnAgentWait', true);
        const delaySeconds = config.get<number>('autoOpenDelaySeconds', 8);

        if (!autoPopup) {
          return;
        }

        if (agentWaitTimer) {
          clearTimeout(agentWaitTimer);
        }

        agentWaitTimer = setTimeout(async () => {
          if (activeExecutionsCount > 0) {
            // Agent or terminal task is taking > autoOpenDelaySeconds: reveal CodeNibbl!
            await vscode.commands.executeCommand('codenibbl.feedView.focus');
            void topUpQueueAsync();
          }
        }, delaySeconds * 1000);
      })
    );

    if ('onDidEndTerminalShellExecution' in vscode.window) {
      context.subscriptions.push(
        (vscode.window as any).onDidEndTerminalShellExecution((_e: any) => {
          activeExecutionsCount = Math.max(0, activeExecutionsCount - 1);
          if (activeExecutionsCount === 0 && agentWaitTimer) {
            clearTimeout(agentWaitTimer);
            agentWaitTimer = undefined;
          }
        })
      );
    }
  }

  // Fresh-Diff Watcher: mark saved files with +50 Scoville boost for AI_VIBE_AUDIT
  context.subscriptions.push(
    vscode.workspace.onDidSaveTextDocument(async (doc) => {
      if (isSensitiveFilePath(doc.uri.fsPath)) {
        return;
      }
      try {
        const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
        const relPath = workspaceFolder
          ? path.relative(workspaceFolder.uri.fsPath, doc.uri.fsPath).replace(/\\/g, '/')
          : path.basename(doc.uri.fsPath);

        const content = doc.getText();
        const chunks = chunkFileByRegex(content);
        const language = detectLanguageFromPath(doc.uri.fsPath);

        for (const chunk of chunks) {
          if (isMundaneBoilerplate(chunk.name, chunk.rawCode)) {
            continue;
          }
          const freshCandidate = createSafeCandidateSymbol({
            filePath: relPath,
            symbolName: chunk.name,
            startLine: chunk.startLine,
            endLine: chunk.endLine,
            language,
            rawCode: chunk.rawCode,
            isFreshDiff: true, // +50 Scoville bonus
          });
          if (freshCandidate) {
            cachedCandidates.unshift(freshCandidate);
          }
        }

        cachedCandidates.sort((a, b) => b.scovilleScore - a.scovilleScore);
        void topUpQueueAsync();
      } catch {
        // Continue gracefully
      }
    })
  );

  // Register Commands
  context.subscriptions.push(
    vscode.commands.registerCommand('codenibbl.openFeed', async () => {
      await vscode.commands.executeCommand('codenibbl.feedView.focus');
    }),

    vscode.commands.registerCommand('codenibbl.spinRandomNibbl', async () => {
      sidebarProvider.renderCurrentCard();
      await context.workspaceState.update(LEDGER_STORAGE_KEY, seenLedger.getState());
      await vscode.commands.executeCommand('codenibbl.feedView.focus');
      void topUpQueueAsync();
    }),

    vscode.commands.registerCommand('codenibbl.configureModel', async () => {
      await secretManager.runInteractiveSetup(llmRouter);
      void topUpQueueAsync();
    }),

    vscode.commands.registerCommand('codenibbl.switchVibe', async () => {
      const pick = await vscode.window.showQuickPick(
        [
          { label: '🌶️ GenZ Hype Beast', value: 'genz_hype' as VibeMode },
          { label: '🕵️ Chaos Gremlin (Playful Roast)', value: 'chaos_gremlin' as VibeMode },
          { label: '☕ Chill Staff Mentor', value: 'chill_mentor' as VibeMode },
        ],
        { title: 'CodeNibbl — Choose Your Vibe Flavor' }
      );
      if (pick) {
        await vscode.workspace
          .getConfiguration('codenibbl')
          .update('vibeMode', pick.value, vscode.ConfigurationTarget.Global);
        sidebarProvider.renderCurrentCard();
      }
    }),

    vscode.commands.registerCommand('codenibbl.clearSeenLedger', async () => {
      seenLedger.reset();
      await context.workspaceState.update(LEDGER_STORAGE_KEY, seenLedger.getState());
      vscode.window.showInformationMessage('🧹 CodeNibbl Seen History cleared!');
    }),

    vscode.commands.registerCommand('codenibbl.githubSponsors', async () => {
      await NibblSidebarProvider.openGitHubSponsorsUrl();
    }),

    vscode.commands.registerCommand('codenibbl.buyMeACoffee', async () => {
      await NibblSidebarProvider.openSponsorUrl();
    })
  );

  // Refresh sidebar & harvest whenever a project folder is opened or closed
  if ('onDidChangeWorkspaceFolders' in vscode.workspace) {
    context.subscriptions.push(
      vscode.workspace.onDidChangeWorkspaceFolders(async () => {
        cachedCandidates = [];
        sidebarProvider.renderCurrentCard(true);
        if (vscode.workspace.workspaceFolders?.length) {
          await refreshCandidates();
          await topUpQueueAsync();
        }
      })
    );
  }

  // Non-blocking initial warm-up (only when a workspace folder is open)
  if (vscode.workspace.workspaceFolders?.length) {
    void (async () => {
      await refreshCandidates();
      await topUpQueueAsync();
    })();
  }
}

export function deactivate(): void {}
