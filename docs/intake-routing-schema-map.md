# Intake Routing Schema Mapping

This document provides detailed mapping tables for all questionnaire fields to their canonical paths in the PatientRecord schema and FHIR resource mappings.

## Routing Questionnaire Mappings

### Visit Type
- **Question LinkId**: `visit-type`
- **Canonical Path**: `PatientRecord.medicalContext.visit_type`
- **FHIR Mapping**: Stored in QuestionnaireResponse, mapped to Patient extension or Encounter extension
- **Values**: `Personal Injury` | `Workers' Compensation` | `General Health & Wellness`

### Treatment Type
- **Question LinkId**: `treatment-type`
- **Canonical Path**: `PatientRecord.medicalContext.treatment_type`
- **FHIR Mapping**: Stored in QuestionnaireResponse
- **Values**: `Chiropractic` | `Pain Management` | `Consultation`
- **Conditional**: Only shown when Visit Type = "General Health & Wellness"

### Payment Method
- **Question LinkId**: `payment-method`
- **Canonical Path**: `PatientRecord.medicalContext.payment_method`
- **FHIR Mapping**: 
  - Patient extension: `legal-representation-lop` (boolean) for attorney-lop
  - Coverage resource type for insurance detection
- **Backend Codes**: 
  - `traditional-insurance` (maps from "My health insurance")
  - `cash-pay` (maps from "Cash or self-pay")
  - `attorney-lop` (maps from "I was referred by my attorney")
  - `workers-comp-carrier` (maps from "My employer's workers' compensation insurance")

## Workers' Compensation Intake Mappings

### Employer Information
| Field | LinkId | Canonical Path | FHIR Mapping |
|-------|--------|----------------|--------------|
| Employer Name | `employer-name` | `PatientRecord.workersCompContext.employer_name` | Patient extension or RelatedPerson |
| Employer Street Address | `employer-street-address` | `PatientRecord.workersCompContext.employer_address.line` | Address resource |
| Employer City | `employer-city` | `PatientRecord.workersCompContext.employer_address.city` | Address resource |
| Employer State | `employer-state` | `PatientRecord.workersCompContext.employer_address.state` | Address resource |
| Employer ZIP | `employer-zip` | `PatientRecord.workersCompContext.employer_address.postalCode` | Address resource |
| Supervisor Name | `supervisor-name` | `PatientRecord.workersCompContext.supervisor_name` | RelatedPerson |
| Date of Injury | `date-of-injury` | `PatientRecord.workersCompContext.date_of_injury` | Condition.onsetDate |
| Time of Injury | `time-of-injury` | `PatientRecord.workersCompContext.time_of_injury` | Condition.onsetPeriod.start |
| Claim Number | `claim-number` | `PatientRecord.workersCompContext.claim_number` | Coverage.identifier |

### Injury Details
| Field | LinkId | Canonical Path | FHIR Mapping |
|-------|--------|----------------|--------------|
| How Injury Occurred | `how-injury-occurred` | `PatientRecord.workersCompContext.injury_narrative` | Condition.note |
| Body Regions Affected | `body-regions-affected` | `PatientRecord.workersCompContext.body_regions_affected` | Condition.bodySite (with ICD-10 coding) |
| Witness Names/Contacts | `witnesses-section` | `PatientRecord.workersCompContext.witnesses` | RelatedPerson or DocumentReference |

### Work Status
| Field | LinkId | Canonical Path | FHIR Mapping |
|-------|--------|----------------|--------------|
| Currently Working | `currently-working` | `PatientRecord.workersCompContext.work_status` | Patient extension or Observation |
| Date Work Stopped | `date-work-stopped` | `PatientRecord.workersCompContext.date_work_stopped` | Observation.effectiveDateTime |
| Restrictions Needed | `restrictions-needed` | `PatientRecord.workersCompContext.restrictions_needed` | Observation.valueString |

## Personal Injury Intake Mappings

### Attorney & Case Information
| Field | LinkId | Canonical Path | FHIR Mapping |
|-------|--------|----------------|--------------|
| Attorney Name | `attorney-name` | `PatientRecord.legalContext.lop_details.responsible_attorney` | RelatedPerson or Patient extension |
| Law Firm | `law-firm` | `PatientRecord.legalContext.lop_details.law_firm` | RelatedPerson.organization |
| LOP Signed Date | `lop-signed-date` | `PatientRecord.legalContext.lop_details.lop_signed_date` | DocumentReference.date |
| Case Status | `case-status` | `PatientRecord.legalContext.case_status` | Patient extension |

### Incident Details
| Field | LinkId | Canonical Path | FHIR Mapping |
|-------|--------|----------------|--------------|
| Date of Incident | `date-of-incident` | (TBD) | Condition.onsetDate |
| How Incident Occurred | `how-incident-occurred` | (TBD) | Condition.note |
| Body Regions Affected | `body-regions-affected` | (TBD) | Condition.bodySite (with ICD-10 coding) |

## Quick Follow-Up Questionnaires Mappings

### Previous Symptoms Display
- **Dynamic Content**: Generated from `getPreviousSymptoms()` function
- **Source**: Most recent QuestionnaireResponse (last 90 days)
- **Display Fields**:
  - Last visit date
  - Pain regions with severity (0-10)
  - Symptom descriptions
  - Treatment recommendations (if available)

### Current Symptoms (Common to All Follow-Ups)
| Field | LinkId | Canonical Path | FHIR Mapping |
|-------|--------|----------------|--------------|
| Current Pain Regions | `current-pain-regions` | `PatientRecord.medicalContext.current_symptoms.regions` | Observation.code |
| Pain Severity | `pain-severity-per-region` | `PatientRecord.medicalContext.current_symptoms.severity` | Observation.valueInteger |
| Changes Description | `changes-description` | `PatientRecord.medicalContext.changes_since_last_visit` | Observation.note |

### PI-Specific Follow-Up Fields
| Field | LinkId | Canonical Path | FHIR Mapping |
|-------|--------|----------------|--------------|
| Case Status | `case-status` | `PatientRecord.legalContext.case_status` | Patient extension |
| Progress Notes | `progress-notes` | `PatientRecord.medicalContext.treatment_progress_notes` | Observation.note |
| New Injuries Details | `new-injuries-details` | `PatientRecord.medicalContext.new_injuries_details` | Condition (new) or Observation |

### Insured Follow-Up Fields
| Field | LinkId | Canonical Path | FHIR Mapping |
|-------|--------|----------------|--------------|
| Insurance Coverage Display | `insurance-display` | Dynamic from Coverage resource | Coverage.display |
| Authorization Number | `authorization-number` | `PatientRecord.medicalContext.authorization_number` | Coverage.extension |

## Pain Management Intake Mappings

### Pain Assessment
| Field | LinkId | Canonical Path | FHIR Mapping |
|-------|--------|----------------|--------------|
| Pain Locations | `pain-locations` | `PatientRecord.medicalContext.pain_assessment.locations` | Observation.bodySite |
| Pain Intensity | `pain-intensity` | `PatientRecord.medicalContext.pain_assessment.intensity` | Observation.valueInteger (0-10) |
| Pain Quality | `pain-quality` | `PatientRecord.medicalContext.pain_assessment.quality` | Observation.valueString (multi-select) |
| Pain Pattern | `pain-pattern` | `PatientRecord.medicalContext.pain_assessment.pattern` | Observation.valueString |
| Pain Duration | `pain-duration` | `PatientRecord.medicalContext.pain_assessment.duration` | Observation.valueString |

### Functional Impact
| Field | LinkId | Canonical Path | FHIR Mapping |
|-------|--------|----------------|--------------|
| ADL Impact | `adl-impact` | `PatientRecord.medicalContext.functional_impact.adl` | Observation.note |
| Work Impact | `work-impact` | `PatientRecord.medicalContext.functional_impact.work` | Observation.valueString |
| Sleep Impact | `sleep-impact` | `PatientRecord.medicalContext.functional_impact.sleep` | Observation.valueString |

### Injection History
| Field | LinkId | Canonical Path | FHIR Mapping |
|-------|--------|----------------|--------------|
| Previous Injections | `previous-injections` | `PatientRecord.medicalContext.injection_history.has_previous` | Procedure (historical) |
| Injection Details | `injection-details` | `PatientRecord.medicalContext.injection_history.details` | Procedure.note |
| Injection Preferences | `injection-preferences` | `PatientRecord.medicalContext.injection_history.preferences` | Observation.note |

## LOP Tracking Mappings

### LOP Details (FHIR Patient Extensions)
| Canonical Path | FHIR Extension | Type | Description |
|----------------|----------------|------|-------------|
| `PatientRecord.legalContext.lop_details.lop_signed_date` | `legal-representation-lop-signed-date` | date | Date LOP was signed |
| `PatientRecord.legalContext.lop_details.lop_document_reference` | `legal-representation-lop-document` | Reference(DocumentReference) | LOP document |
| `PatientRecord.legalContext.lop_details.responsible_attorney` | `legal-representation-attorney` | string | Attorney name |
| `PatientRecord.legalContext.lop_details.law_firm` | `legal-representation-law-firm` | string | Law firm name |
| `PatientRecord.legalContext.lop_details.estimated_settlement_timeline` | `legal-representation-settlement-timeline` | string | Estimated timeline |
| `PatientRecord.legalContext.billing_notes` | `legal-representation-billing-notes` | string | Biller notes |

### LOP Tracking Flags
- **Extension**: `requires-lop-tracking` (boolean) - Set on QuestionnaireResponse or Encounter
- **Extension**: `requires-cms1500` (boolean) - Set on QuestionnaireResponse or Encounter
- **Backend Code**: `payment-method-code` - Stored in QuestionnaireResponse answerOption extension

## Exam Guide Field Mappings

### Chiropractic Exam Guide ? StructuredNoteV1
| Exam Guide Field | StructuredNoteV1 Path | FHIR Observation Code |
|------------------|----------------------|----------------------|
| Blood Pressure | `examination.vitals.bloodPressure` | 85354-9 |
| Range of Motion | `examination.rangeOfMotion` | (TBD) |
| Orthopedic Tests | `examination.orthopedicTests` | (TBD) |
| Neurological Exam | `examination.neurologicalExam` | (TBD) |
| Palpation | `examination.palpation` | (TBD) |

### Pain Management Exam Guide ? StructuredNoteV1
| Exam Guide Field | StructuredNoteV1 Path | FHIR Observation Code |
|------------------|----------------------|----------------------|
| Pain Scales | `examination.painScales` | (TBD) |
| Functional Assessment | `examination.functionalAssessment` | (TBD) |
| Injection Site Evaluation | `examination.injectionSite` | (TBD) |

## Implementation Notes

1. **Canonical Path Format**: All paths use dot notation (e.g., `PatientRecord.medicalContext.payment_method`)
2. **FHIR Resource Mapping**: Most fields map to QuestionnaireResponse ? Observation or Patient extension
3. **ICD-10 Coding**: Body region fields support ICD-10 auto-suggestions via `icd10-suggestions` extension
4. **Dynamic Content**: Previous symptoms and insurance coverage use dynamic content extensions
5. **Multi-Select Fields**: Repeating choice questions map to arrays in canonical schema
6. **Conditional Fields**: Fields with `enableWhen` conditions are only populated when conditions are met

## Validation Rules

- All canonical paths must be validated against PatientRecord schema
- ICD-10 codes must be validated against ICD-10 code system
- Date fields must be valid ISO 8601 dates
- Integer fields (pain severity) must be within defined ranges (0-10)
- Required fields must be present before questionnaire submission
