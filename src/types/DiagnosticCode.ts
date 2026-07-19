import type { SkillDiagnosticKind } from './SkillDiagnostic';

/**
 * Stable diagnostic codes. Quick fixes key off these values, so they must not
 * change casually. Grouped by the rule area that produces them.
 */
export const DiagnosticCode = {
  // Frontmatter
  FrontmatterMissing: 'skill.frontmatter.missing',
  FrontmatterInvalid: 'skill.frontmatter.invalid',
  FrontmatterNotAtTop: 'skill.frontmatter.notAtTop',
  FrontmatterDuplicateKey: 'skill.frontmatter.duplicateKey',

  // Profile-specific metadata rules
  MetadataReservedWord: 'skill.metadata.reservedWord',
  MetadataXmlTag: 'skill.metadata.xmlTag',
  MetadataFieldType: 'skill.metadata.fieldType',
  MetadataUnknownKey: 'skill.metadata.unknownKey',

  // Portability notes (not editor diagnostics)
  PortabilityClaudeDescriptionLong: 'skill.portability.claude.descriptionLong',

  // name
  NameMissing: 'skill.name.missing',
  NameType: 'skill.name.type',
  NameTooLong: 'skill.name.tooLong',
  NameFormat: 'skill.name.format',
  NameFolderMismatch: 'skill.name.folderMismatch',

  // description
  DescriptionMissing: 'skill.description.missing',
  DescriptionType: 'skill.description.type',
  DescriptionTooLong: 'skill.description.tooLong',
  DescriptionTooVerbose: 'skill.description.tooVerbose',
  DescriptionTooShort: 'skill.description.tooShort',
  DescriptionVague: 'skill.description.vague',
  DescriptionOverbroadTrigger: 'skill.description.overbroadTrigger',
  DescriptionInstructionHeavy: 'skill.description.instructionHeavy',
  DescriptionNoVerb: 'skill.description.noVerb',
  DescriptionNoTrigger: 'skill.description.noTrigger',
  DescriptionNoBoundary: 'skill.description.noBoundary',
  DescriptionNotFrontLoaded: 'skill.description.notFrontLoaded',

  // Markdown links
  LinkMissing: 'skill.link.missing',
  LinkCaseMismatch: 'skill.link.caseMismatch',
  LinkAbsolute: 'skill.link.absolute',
  LinkRemoteSuspicious: 'skill.link.remoteSuspicious',
  LinkEscapesSkillRoot: 'skill.link.escapesRoot',

  // Resources
  ResourceUnreferenced: 'skill.resource.unreferenced',

  // Body / sections
  BodyMissing: 'skill.body.missing',
  BodyNoExamples: 'skill.body.noExamples',
  BodyNoWhenToUse: 'skill.body.noWhenToUse',
  BodySuggestBoundary: 'skill.body.suggestBoundary',
  BodySuggestIO: 'skill.body.suggestIO',
} as const;

export type DiagnosticCode = (typeof DiagnosticCode)[keyof typeof DiagnosticCode];

/**
 * The kind of every diagnostic code (Task 86). Kept next to the codes so the
 * classification stays visible and exhaustive; `diag()` stamps it centrally.
 * See docs/rules.md for the same grouping.
 */
export const KIND_BY_CODE: Record<string, SkillDiagnosticKind> = {
  // Specification — the file is invalid.
  [DiagnosticCode.FrontmatterMissing]: 'specification',
  [DiagnosticCode.FrontmatterInvalid]: 'specification',
  [DiagnosticCode.FrontmatterNotAtTop]: 'specification',
  [DiagnosticCode.FrontmatterDuplicateKey]: 'specification',
  [DiagnosticCode.NameMissing]: 'specification',
  [DiagnosticCode.NameType]: 'specification',
  [DiagnosticCode.NameTooLong]: 'specification',
  [DiagnosticCode.NameFormat]: 'specification',
  [DiagnosticCode.NameFolderMismatch]: 'specification',
  [DiagnosticCode.DescriptionMissing]: 'specification',
  [DiagnosticCode.DescriptionType]: 'specification',
  [DiagnosticCode.DescriptionTooLong]: 'specification',
  [DiagnosticCode.LinkMissing]: 'specification',
  // Compatibility — valid, but a target profile is stricter or less portable.
  [DiagnosticCode.LinkCaseMismatch]: 'compatibility',
  [DiagnosticCode.LinkAbsolute]: 'compatibility',
  [DiagnosticCode.MetadataReservedWord]: 'compatibility',
  [DiagnosticCode.MetadataXmlTag]: 'compatibility',
  [DiagnosticCode.MetadataFieldType]: 'compatibility',
  [DiagnosticCode.MetadataUnknownKey]: 'compatibility',
  [DiagnosticCode.PortabilityClaudeDescriptionLong]: 'compatibility',
  // Security — a risky reference.
  [DiagnosticCode.LinkEscapesSkillRoot]: 'security',
  [DiagnosticCode.LinkRemoteSuspicious]: 'security',
  // Quality — discoverability recommendations.
  [DiagnosticCode.DescriptionTooShort]: 'quality',
  [DiagnosticCode.DescriptionTooVerbose]: 'quality',
  [DiagnosticCode.DescriptionVague]: 'quality',
  [DiagnosticCode.DescriptionOverbroadTrigger]: 'quality',
  [DiagnosticCode.DescriptionInstructionHeavy]: 'quality',
  [DiagnosticCode.DescriptionNoVerb]: 'quality',
  [DiagnosticCode.DescriptionNoTrigger]: 'quality',
  [DiagnosticCode.DescriptionNoBoundary]: 'quality',
  [DiagnosticCode.DescriptionNotFrontLoaded]: 'quality',
  [DiagnosticCode.ResourceUnreferenced]: 'quality',
  [DiagnosticCode.BodyMissing]: 'quality',
  [DiagnosticCode.BodyNoExamples]: 'quality',
  [DiagnosticCode.BodyNoWhenToUse]: 'quality',
  [DiagnosticCode.BodySuggestBoundary]: 'quality',
  [DiagnosticCode.BodySuggestIO]: 'quality',
};

/**
 * Quick-fix identifiers referenced by the code-action provider. Kept alongside
 * the diagnostic codes so the mapping between the two stays visible.
 */
export const QuickFixId = {
  ConvertNameToKebabCase: 'fix.name.kebabCase',
  RenameParentFolder: 'fix.name.renameFolder',
  InsertFrontmatter: 'fix.frontmatter.insert',
  InsertName: 'fix.name.insert',
  InsertDescription: 'fix.description.insert',
  InsertBodyTemplate: 'fix.body.insertTemplate',
  InsertUseWhenClause: 'fix.description.useWhen',
  InsertDoNotUseClause: 'fix.description.doNotUse',
  CreateMissingLinkedFile: 'fix.link.createFile',
  AddResourceLink: 'fix.resource.addLink',
} as const;

export type QuickFixId = (typeof QuickFixId)[keyof typeof QuickFixId];
