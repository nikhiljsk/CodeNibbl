/**
 * ============================================================================
 * CodeNibbl — OS Keychain Secret Manager (`src/config/secretManager.ts`)
 * ============================================================================
 * SECURITY INVARIANT:
 * - API keys MUST ONLY be stored in `vscode.SecretStorage` (`context.secrets`),
 *   which uses the OS Keychain (Windows Credential Manager, macOS Keychain,
 *   Linux libsecret).
 * - NEVER read or write API keys to `settings.json` or workspace files.
 */

import * as vscode from 'vscode';
import { LLMProviderType } from '../types';
import { UniversalLLMRouter } from '../llm/universalRouter';
import { redactSecretsFromError } from '../security/secretScrubber';

const SECRET_KEY_PREFIX = 'codenibbl.apiKey.';

export const RECOMMENDED_MODELS: Record<LLMProviderType, string[]> = {
  'vscode-lm': ['copilot-auto'],
  openai: ['gpt-4o-mini', 'gpt-4o', 'o3-mini'],
  anthropic: ['claude-3-5-haiku-latest', 'claude-3-7-sonnet-latest'],
  gemini: ['gemini-2.5-flash', 'gemini-2.0-flash'],
  xai: ['grok-3-mini', 'grok-2-latest'],
  custom: ['llama3.3', 'qwen2.5-coder'],
};

export class SecretManager {
  constructor(private readonly secrets: vscode.SecretStorage) {}

  /**
   * Retrieves the API key for the given provider from the OS Keychain.
   */
  public async getApiKey(provider: LLMProviderType): Promise<string | undefined> {
    if (provider === 'vscode-lm') {
      return undefined;
    }
    return this.secrets.get(`${SECRET_KEY_PREFIX}${provider}`);
  }

  /**
   * Stores the API key for the given provider into the OS Keychain.
   */
  public async storeApiKey(provider: LLMProviderType, apiKey: string): Promise<void> {
    await this.secrets.store(`${SECRET_KEY_PREFIX}${provider}`, apiKey.trim());
  }

  /**
   * Deletes the stored API key for the given provider.
   */
  public async deleteApiKey(provider: LLMProviderType): Promise<void> {
    await this.secrets.delete(`${SECRET_KEY_PREFIX}${provider}`);
  }

  /**
   * Interactive 3-step QuickPick flow to configure Provider, Model, and API Key,
   * with an optional fast connection ping via `UniversalLLMRouter`.
   */
  public async runInteractiveSetup(llmRouter?: UniversalLLMRouter): Promise<void> {
    const providerPick = await vscode.window.showQuickPick(
      [
        {
          label: '$(sparkle) VS Code Built-in (vscode.lm)',
          description: 'Free via GitHub Copilot / Cursor — Zero API Key needed!',
          provider: 'vscode-lm' as LLMProviderType,
        },
        {
          label: '$(key) OpenAI',
          description: 'gpt-4o-mini, gpt-4o, o3-mini',
          provider: 'openai' as LLMProviderType,
        },
        {
          label: '$(key) Anthropic (Claude)',
          description: 'claude-3-5-haiku-latest, claude-3-7-sonnet-latest',
          provider: 'anthropic' as LLMProviderType,
        },
        {
          label: '$(key) Google Gemini',
          description: 'gemini-2.5-flash, gemini-2.0-flash',
          provider: 'gemini' as LLMProviderType,
        },
        {
          label: '$(key) xAI (Grok)',
          description: 'grok-3-mini, grok-2-latest',
          provider: 'xai' as LLMProviderType,
        },
        {
          label: '$(server) Custom / Local (Ollama, OpenRouter)',
          description: 'Any OpenAI-compatible endpoint',
          provider: 'custom' as LLMProviderType,
        },
      ],
      { title: 'CodeNibbl 🐹🌶️ — Step 1/3: Choose Your AI Provider' }
    );

    if (!providerPick) {
      return;
    }

    const config = vscode.workspace.getConfiguration('codenibbl');
    await config.update('provider', providerPick.provider, vscode.ConfigurationTarget.Global);

    if (providerPick.provider !== 'vscode-lm') {
      const models = RECOMMENDED_MODELS[providerPick.provider];
      const modelInput = await vscode.window.showInputBox({
        title: `CodeNibbl — Step 2/3: Model ID for ${providerPick.provider}`,
        value: models[0],
        prompt: `Recommended: ${models.join(', ')}`,
      });

      if (modelInput) {
        await config.update('modelId', modelInput.trim(), vscode.ConfigurationTarget.Global);
      }

      if (providerPick.provider === 'custom') {
        const baseUrlInput = await vscode.window.showInputBox({
          title: 'CodeNibbl — Custom Endpoint Base URL',
          value: 'http://127.0.0.1:11434/v1',
          prompt: 'Localhost (http://127.0.0.1:port) or remote HTTPS endpoint',
        });
        if (baseUrlInput) {
          await config.update(
            'customBaseUrl',
            baseUrlInput.trim(),
            vscode.ConfigurationTarget.Global
          );
        }
      }

      const apiKeyInput = await vscode.window.showInputBox({
        title: `CodeNibbl — Step 3/3: Enter ${providerPick.provider.toUpperCase()} API Key`,
        password: true,
        ignoreFocusOut: true,
        prompt: 'Stored securely in your OS Keychain (vscode.SecretStorage). Never written to files.',
      });

      if (apiKeyInput && apiKeyInput.trim()) {
        await this.storeApiKey(providerPick.provider, apiKeyInput);
      }
    }

    // Optional connection verification ping
    if (llmRouter) {
      try {
        await vscode.window.withProgress(
          {
            location: vscode.ProgressLocation.Notification,
            title: `⚡ CodeNibbl: Verifying connection to ${providerPick.provider}...`,
            cancellable: false,
          },
          async () => {
            await llmRouter.generateJson({
              systemPrompt: 'You are a connection test. Respond only with JSON: {"status": "ok"}',
              userPrompt: 'Ping',
            });
          }
        );
        vscode.window.showInformationMessage(
          `⚡ Connection verified! Successfully connected to ${providerPick.provider}. Nibbl is ready to cook! 🌶️`
        );
      } catch (err) {
        vscode.window.showWarningMessage(
          `⚠️ CodeNibbl saved your configuration, but the connection test failed: ${redactSecretsFromError(err)}`
        );
      }
    } else {
      vscode.window.showInformationMessage(
        `🌶️ CodeNibbl connected to ${providerPick.provider}! Ready to cook spicy snippets.`
      );
    }
  }
}
