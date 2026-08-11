'use client'
export function ArchivePatientButton({action}:{action:()=>Promise<void>}){return <button type="button" className="rounded-xl border border-red-200 px-3 py-2 text-sm font-bold text-red-700 hover:bg-red-50" onClick={()=>{if(confirm('Arquivar este paciente? O registro ficará preservado para auditoria.')) action()}}>Arquivar paciente</button>}
