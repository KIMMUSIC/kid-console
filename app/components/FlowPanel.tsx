// Shared flow input types. The former global "Inputs" panel was replaced by the
// context toolbar (Console) + contextual inputs inside each journey step, so this
// module now only owns the shapes those pieces share.

export type ActiveFlow = 'access' | 'agegate'

export interface FlowInputs {
  jurisdiction: string
  dateOfBirth: string
  age: string
  parentEmail: string
  kuid: string
  // Access Age Verification (AgeKit+) criteria
  criteriaMode: 'age' | 'ageCategory'
  criteriaAge: string
  criteriaCategory: 'DIGITAL_YOUTH_OR_ADULT' | 'ADULT'
}
