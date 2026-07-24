/**
 * Modern VS Code activation contract.
 *
 * Since VS Code 1.74 the activation events for contributed views and commands are
 * generated implicitly from `contributes.views` / `contributes.commands`; explicit
 * `onView:` / `onCommand:` entries are only required when the extension targets an
 * older engine. Manifest tests should therefore assert "this contribution can
 * activate the extension" rather than "an explicit entry exists".
 */
import type packageJson from '../../package.json';

type PackageManifest = typeof packageJson;

const IMPLICIT_ACTIVATION_SINCE: readonly [number, number] = [1, 74];

/** Parse the minimum VS Code version out of an engines range like `^1.90.0`. */
export function minimumEngineVersion(manifest: PackageManifest): [number, number] {
  const match = /(\d+)\.(\d+)/.exec(manifest.engines.vscode);
  if (!match) {
    throw new Error(`Unparseable engines.vscode range: ${manifest.engines.vscode}`);
  }
  return [Number(match[1]), Number(match[2])];
}

export function supportsImplicitActivation(manifest: PackageManifest): boolean {
  const [major, minor] = minimumEngineVersion(manifest);
  const [sinceMajor, sinceMinor] = IMPLICIT_ACTIVATION_SINCE;
  return major > sinceMajor || (major === sinceMajor && minor >= sinceMinor);
}

function contributedViewIds(manifest: PackageManifest): Set<string> {
  return new Set(
    Object.values(manifest.contributes.views)
      .flat()
      .map((view) => view.id),
  );
}

function contributedCommandIds(manifest: PackageManifest): Set<string> {
  return new Set(manifest.contributes.commands.map((command) => command.command));
}

/**
 * True when the given activation event (`onView:x` / `onCommand:y`) either appears
 * explicitly in `activationEvents`, or is generated implicitly because the target
 * is both contributed in the manifest and the extension requires VS Code ≥ 1.74.
 * This is the property the extension actually needs — the contribution must be
 * able to activate it — while still catching a view or command that could never
 * activate the extension (not contributed, no explicit event).
 */
export function activatesFor(manifest: PackageManifest, event: string): boolean {
  if ((manifest.activationEvents as readonly string[]).includes(event)) {
    return true;
  }
  const separator = event.indexOf(':');
  if (separator === -1) {
    return false;
  }
  const kind = event.slice(0, separator);
  const target = event.slice(separator + 1);
  if (kind === 'onView') {
    return supportsImplicitActivation(manifest) && contributedViewIds(manifest).has(target);
  }
  if (kind === 'onCommand') {
    return supportsImplicitActivation(manifest) && contributedCommandIds(manifest).has(target);
  }
  return false;
}
