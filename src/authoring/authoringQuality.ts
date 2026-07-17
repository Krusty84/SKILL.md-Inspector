import type { SkillDocument } from '../types/SkillDocument';
export type AuthoringLabel = 'good' | 'needs-attention';
export interface AuthoringFinding { criterion: string; message: string; suggestion: string; }
export interface InstructionQualityResult { score: number; label: AuthoringLabel; findings: AuthoringFinding[]; }
export interface ResourceQualityResult { score: number; label: AuthoringLabel; findings: AuthoringFinding[]; }
export interface SkillAuthoringQuality { instructions: InstructionQualityResult; resources: ResourceQualityResult; }
/** Full-save/report deterministic authoring checks; never used by text-only validation. */
export function assessAuthoringQuality(doc: SkillDocument): SkillAuthoringQuality {
 const findings: AuthoringFinding[] = []; const body = doc.body;
 if (!body.replace(/^#+.*$/gm, '').trim()) findings.push({criterion:'Substantive body',message:'Body contains headings only.',suggestion:'Add concrete instructions.'});
 if (/\bTODO\b|<\s*(?:input|describe)[^>]*>/i.test(body)) findings.push({criterion:'Placeholders',message:'Template placeholder found.',suggestion:'Replace placeholders with skill-specific guidance.'});
 if (/^#+\s*examples?\s*$/im.test(body) && !/^#+\s*examples?\s*$\s*\n\s*\S+/im.test(body)) findings.push({criterion:'Examples',message:'Examples heading has no example content.',suggestion:'Add a representative input and outcome.'});
 if (body.split('\n').length > 500) findings.push({criterion:'Length',message:'Body exceeds 500 lines.',suggestion:'Move detailed material to documented references.'});
 const resourceFindings = doc.resources.filter(r => !r.referenced).map(r => ({criterion:'Unreferenced resource',message:`${r.relativePath} is not referenced.`,suggestion:'Link it from surrounding explanatory text.'}));
 for (const resource of doc.resources) if (resource.sizeBytes > 1024 * 1024) resourceFindings.push({criterion:'Large resource',message:`${resource.relativePath} exceeds 1 MiB.`,suggestion:'Reduce or document the large resource.'});
 const score = (items: AuthoringFinding[]) => Math.max(0, 100 - items.length * 20);
 return { instructions:{score:score(findings),label:findings.length?'needs-attention':'good',findings}, resources:{score:score(resourceFindings),label:resourceFindings.length?'needs-attention':'good',findings:resourceFindings} };
}
