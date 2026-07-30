import { describe, expect, it } from 'vitest';
import packageJson from '../package.json';
import nls from '../package.nls.json';

// VS Code substitutes a manifest value only when the WHOLE string is `%key%`.
const PLACEHOLDER = /^%([^%]+)%$/;

function collectPlaceholders(value: unknown, found: Set<string>): void {
  if (typeof value === 'string') {
    const match = PLACEHOLDER.exec(value);
    if (match) found.add(match[1]);
    return;
  }
  if (Array.isArray(value)) {
    for (const item of value) collectPlaceholders(item, found);
    return;
  }
  if (value && typeof value === 'object') {
    for (const entry of Object.values(value)) collectPlaceholders(entry, found);
  }
}

function expectPlaceholder(actual: unknown, context: string): void {
  expect(typeof actual, context).toBe('string');
  expect(actual, context).toMatch(PLACEHOLDER);
}

describe('package.nls.json', () => {
  const referenced = new Set<string>();
  collectPlaceholders(packageJson, referenced);
  const defined = new Set(Object.keys(nls));

  it('defines every placeholder referenced by package.json', () => {
    const missing = [...referenced].filter((key) => !defined.has(key));
    expect(missing).toEqual([]);
  });

  it('has no orphan keys', () => {
    const orphans = [...defined].filter((key) => !referenced.has(key));
    expect(orphans).toEqual([]);
  });

  it('holds non-empty English text for every key', () => {
    for (const [key, value] of Object.entries(nls)) {
      expect(typeof value, key).toBe('string');
      expect((value as string).length, key).toBeGreaterThan(0);
      // A value that is itself a placeholder would hide the English text.
      expect(value, key).not.toMatch(PLACEHOLDER);
    }
  });

  it('externalizes every localizable manifest field', () => {
    expectPlaceholder(packageJson.displayName, 'displayName');
    expectPlaceholder(packageJson.description, 'description');
    for (const command of packageJson.contributes.commands) {
      expectPlaceholder(command.title, `${command.command} title`);
      expectPlaceholder(command.category, `${command.command} category`);
    }
    for (const containers of Object.values(packageJson.contributes.viewsContainers)) {
      for (const container of containers) expectPlaceholder(container.title, `${container.id} title`);
    }
    for (const views of Object.values(packageJson.contributes.views)) {
      for (const view of views as Array<{ id: string; name: string; contextualTitle?: string }>) {
        expectPlaceholder(view.name, `${view.id} name`);
        if (view.contextualTitle !== undefined) {
          expectPlaceholder(view.contextualTitle, `${view.id} contextualTitle`);
        }
      }
    }
    for (const submenu of packageJson.contributes.submenus) {
      expectPlaceholder(submenu.label, `${submenu.id} label`);
    }
    for (const welcome of packageJson.contributes.viewsWelcome) {
      expectPlaceholder(welcome.contents, `viewsWelcome ${welcome.view}`);
    }
    // Any description at any nesting depth (settings, weight sub-properties,
    // template item fields, enum entries) must be externalized. `default`
    // subtrees hold data, not UI text.
    const walkConfig = (node: unknown, context: string): void => {
      if (Array.isArray(node)) {
        node.forEach((item, index) => walkConfig(item, `${context}[${index}]`));
        return;
      }
      if (!node || typeof node !== 'object') return;
      for (const [key, value] of Object.entries(node)) {
        if (key === 'default') continue;
        if ((key === 'description' || key === 'markdownDescription') && typeof value === 'string') {
          expectPlaceholder(value, `${context}.${key}`);
        } else if (key === 'enumDescriptions' && Array.isArray(value)) {
          for (const entry of value) expectPlaceholder(entry, `${context}.${key}`);
        } else {
          walkConfig(value, `${context}.${key}`);
        }
      }
    };
    for (const section of packageJson.contributes.configuration) {
      expectPlaceholder(section.title, `configuration section order ${section.order}`);
      walkConfig(section.properties, `configuration(order ${section.order})`);
    }
  });
});
