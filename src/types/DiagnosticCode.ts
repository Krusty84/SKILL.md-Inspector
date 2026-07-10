/**
 * Stable diagnostic codes. Quick fixes key off these values, so they must not
 * change casually. Grouped by the rule area that produces them.
 */
export const DiagnosticCode = {
  // Frontmatter
  FrontmatterMissing: 'skill.frontmatter.missing',
  FrontmatterInvalid: 'skill.frontmatter.invalid',
  FrontmatterNotAtTop: 'skill.frontmatter.notAtTop',

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
  DescriptionTooShort: 'skill.description.tooShort',
  DescriptionVague: 'skill.description.vague',
  DescriptionNoVerb: 'skill.description.noVerb',
  DescriptionNoTrigger: 'skill.description.noTrigger',
  DescriptionNoBoundary: 'skill.description.noBoundary',
  DescriptionNotFrontLoaded: 'skill.description.notFrontLoaded',

  // Markdown links
  LinkMissing: 'skill.link.missing',
  LinkAbsolute: 'skill.link.absolute',
  LinkRemoteSuspicious: 'skill.link.remoteSuspicious',

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
