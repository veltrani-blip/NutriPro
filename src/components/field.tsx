import type { InputHTMLAttributes, SelectHTMLAttributes, TextareaHTMLAttributes } from 'react'

export function InputField({ label, ...props }: InputHTMLAttributes<HTMLInputElement> & { label: string }) {
  return <label className="block"><span className="np-label">{label}</span><input className="np-input" {...props} /></label>
}
export function TextareaField({ label, ...props }: TextareaHTMLAttributes<HTMLTextAreaElement> & { label: string }) {
  return <label className="block"><span className="np-label">{label}</span><textarea className="np-input min-h-24" {...props} /></label>
}
export function SelectField({ label, children, ...props }: SelectHTMLAttributes<HTMLSelectElement> & { label: string; children: React.ReactNode }) {
  return <label className="block"><span className="np-label">{label}</span><select className="np-input" {...props}>{children}</select></label>
}
