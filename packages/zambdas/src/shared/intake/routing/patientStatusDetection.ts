import Oystehr from '@oystehr/sdk';
import { Condition, Coverage, Encounter, Patient, QuestionnaireResponse } from 'fhir/r4b';
import { getPatientResourceById } from '../../patients';

export type PaymentMethod = 'traditional-insurance' | 'cash-pay' | 'attorney-lop' | 'workers-comp-carrier' | 'unknown';

export interface PreviousSymptomsSummary {
  regions: Array<{
    name: string;
    severity?: number; // 0-10 scale
    symptoms: string;
    date: string;
  }>;
  lastVisitDate: string | null;
}

const LEGAL_REPRESENTATION_LOP_EXTENSION_URL =
  'https://fhir.zapehr.com/r4/StructureDefinitions/legal-representation-lop';
const WORKERS_COMP_CATEGORY_CODE = 'workers-compensation';
const PERSONAL_INJURY_CATEGORY_CODE = 'personal-injury';

/**
 * Check if a patient is new (has no previous encounters)
 */
export async function isNewPatient(patientId: string, oystehr: Oystehr): Promise<boolean> {
  console.log(`Checking if patient ${patientId} is new`);
  
  const encounters = (
    await oystehr.fhir.search<Encounter>({
      resourceType: 'Encounter',
      params: [
        {
          name: 'patient',
          value: `Patient/${patientId}`,
        },
        {
          name: '_count',
          value: '1',
        },
      ],
    })
  ).unbundle();

  const isNew = encounters.length === 0;
  console.log(`Patient ${patientId} is ${isNew ? 'new' : 'existing'}`);
  return isNew;
}

/**
 * Check if patient has personal injury history
 * Queries Conditions with category = "personal-injury" and checks Patient extension for LOP
 */
export async function hasPersonalInjuryHistory(patientId: string, oystehr: Oystehr): Promise<boolean> {
  console.log(`Checking if patient ${patientId} has personal injury history`);
  
  try {
    // Query Conditions with personal-injury category
    const conditions = (
      await oystehr.fhir.search<Condition>({
        resourceType: 'Condition',
        params: [
          {
            name: 'patient',
            value: `Patient/${patientId}`,
          },
          {
            name: 'category',
            value: PERSONAL_INJURY_CATEGORY_CODE,
          },
        ],
      })
    ).unbundle();

    // Check Patient extension for legal-representation-lop
    const patient = await getPatientResourceById(patientId, oystehr);
    const hasLOPExtension = patient.extension?.some(
      (ext) =>
        ext.url === LEGAL_REPRESENTATION_LOP_EXTENSION_URL &&
        ext.valueBoolean === true
    );

    const hasPIHistory = conditions.length > 0 || hasLOPExtension;
    console.log(`Patient ${patientId} ${hasPIHistory ? 'has' : 'does not have'} personal injury history`);
    return hasPIHistory;
  } catch (error) {
    console.error(`Error checking personal injury history for patient ${patientId}:`, error);
    return false;
  }
}

/**
 * Check if patient has workers' compensation history
 * Queries Conditions with category = "workers-compensation" and checks Coverage for WC carrier coding
 */
export async function hasWorkersCompHistory(patientId: string, oystehr: Oystehr): Promise<boolean> {
  console.log(`Checking if patient ${patientId} has workers' compensation history`);
  
  try {
    // Query Conditions with workers-compensation category
    const conditions = (
      await oystehr.fhir.search<Condition>({
        resourceType: 'Condition',
        params: [
          {
            name: 'patient',
            value: `Patient/${patientId}`,
          },
          {
            name: 'category',
            value: WORKERS_COMP_CATEGORY_CODE,
          },
        ],
      })
    ).unbundle();

    // Check Coverage resources for WC carrier coding
    const coverages = (
      await oystehr.fhir.search<Coverage>({
        resourceType: 'Coverage',
        params: [
          {
            name: 'beneficiary',
            value: `Patient/${patientId}`,
          },
        ],
      })
    ).unbundle();

    // Check if any coverage has workers' comp type/category
    // Common WC indicators: type coding with "WC", "WC", or payor with WC naming
    const hasWCCoverage = coverages.some((coverage) => {
      const typeCode = coverage.type?.coding?.[0]?.code?.toLowerCase();
      const payerName = coverage.payor?.[0]?.display?.toLowerCase() || '';
      return (
        typeCode?.includes('wc') ||
        typeCode?.includes('workers') ||
        payerName.includes('workers comp') ||
        payerName.includes('workers\' compensation')
      );
    });

    const hasWCHistory = conditions.length > 0 || hasWCCoverage;
    console.log(`Patient ${patientId} ${hasWCHistory ? 'has' : 'does not have'} workers' compensation history`);
    return hasWCHistory;
  } catch (error) {
    console.error(`Error checking workers' comp history for patient ${patientId}:`, error);
    return false;
  }
}

/**
 * Get payment method for patient
 * Queries Coverage resources and Patient extensions to determine payment method
 * For LOP cases: Checks Patient extension legal-representation-lop = true
 */
export async function getPaymentMethod(patientId: string, oystehr: Oystehr): Promise<PaymentMethod> {
  console.log(`Getting payment method for patient ${patientId}`);
  
  try {
    const patient = await getPatientResourceById(patientId, oystehr);

    // Check for LOP extension first (highest priority)
    const hasLOPExtension = patient.extension?.some(
      (ext) =>
        ext.url === LEGAL_REPRESENTATION_LOP_EXTENSION_URL &&
        ext.valueBoolean === true
    );

    if (hasLOPExtension) {
      console.log(`Patient ${patientId} has attorney LOP`);
      return 'attorney-lop';
    }

    // Query Coverage resources
    const coverages = (
      await oystehr.fhir.search<Coverage>({
        resourceType: 'Coverage',
        params: [
          {
            name: 'beneficiary',
            value: `Patient/${patientId}`,
          },
          {
            name: 'status',
            value: 'active',
          },
        ],
      })
    ).unbundle();

    // Check for workers' comp coverage
    const hasWCCoverage = coverages.some((coverage) => {
      const typeCode = coverage.type?.coding?.[0]?.code?.toLowerCase();
      const payerName = coverage.payor?.[0]?.display?.toLowerCase() || '';
      return (
        typeCode?.includes('wc') ||
        typeCode?.includes('workers') ||
        payerName.includes('workers comp') ||
        payerName.includes('workers\' compensation')
      );
    });

    if (hasWCCoverage) {
      console.log(`Patient ${patientId} has workers' compensation coverage`);
      return 'workers-comp-carrier';
    }

    // Check if patient has active insurance coverage (traditional insurance)
    if (coverages.length > 0) {
      console.log(`Patient ${patientId} has traditional insurance`);
      return 'traditional-insurance';
    }

    // Default to cash-pay if no coverage found
    console.log(`Patient ${patientId} has no insurance, defaulting to cash-pay`);
    return 'cash-pay';
  } catch (error) {
    console.error(`Error getting payment method for patient ${patientId}:`, error);
    return 'unknown';
  }
}

/**
 * Get previous symptoms summary from most recent QuestionnaireResponse (last 90 days)
 * Extracts pain regions, severity (0-10), and symptom descriptions
 */
export async function getPreviousSymptoms(
  patientId: string,
  oystehr: Oystehr
): Promise<PreviousSymptomsSummary> {
  console.log(`Getting previous symptoms for patient ${patientId}`);
  
  try {
    // Calculate date 90 days ago
    const ninetyDaysAgo = new Date();
    ninetyDaysAgo.setDate(ninetyDaysAgo.getDate() - 90);
    const ninetyDaysAgoISO = ninetyDaysAgo.toISOString();

    // Query QuestionnaireResponses for patient within last 90 days, ordered by date
    const questionnaireResponses = (
      await oystehr.fhir.search<QuestionnaireResponse>({
        resourceType: 'QuestionnaireResponse',
        params: [
          {
            name: 'subject',
            value: `Patient/${patientId}`,
          },
          {
            name: 'status',
            value: 'completed',
          },
          {
            name: '_sort',
            value: '-authored',
          },
          {
            name: '_count',
            value: '10', // Get up to 10 most recent responses
          },
        ],
      })
    ).unbundle();

    // Filter to last 90 days and get the most recent
    const recentResponses = questionnaireResponses
      .filter((qr) => {
        if (!qr.authored) return false;
        return new Date(qr.authored) >= ninetyDaysAgo;
      })
      .sort((a, b) => {
        if (!a.authored || !b.authored) return 0;
        return new Date(b.authored).getTime() - new Date(a.authored).getTime();
      });

    if (recentResponses.length === 0) {
      console.log(`No recent QuestionnaireResponses found for patient ${patientId}`);
      return {
        regions: [],
        lastVisitDate: null,
      };
    }

    const mostRecentResponse = recentResponses[0];
    const lastVisitDate = mostRecentResponse.authored || null;

    // Extract pain regions and symptoms from questionnaire response
    // This assumes a standard structure - may need adjustment based on actual questionnaire format
    const regions: PreviousSymptomsSummary['regions'] = [];

    const extractPainData = (items: QuestionnaireResponse['item'] | undefined, parentPath = ''): void => {
      if (!items) return;

      for (const item of items) {
        const currentPath = parentPath ? `${parentPath}.${item.linkId}` : item.linkId;

        // Look for pain region questions (common linkIds: 'pain-regions', 'body-regions', etc.)
        if (
          item.linkId?.toLowerCase().includes('region') ||
          item.linkId?.toLowerCase().includes('pain') ||
          item.linkId?.toLowerCase().includes('symptom')
        ) {
          const answerText = item.answer?.map((a) => a.valueString || a.valueCoding?.display || '').join(', ');
          if (answerText) {
            regions.push({
              name: item.text || item.linkId || 'Unknown region',
              symptoms: answerText,
              date: lastVisitDate || new Date().toISOString(),
            });
          }
        }

        // Look for pain severity (0-10 scale)
        if (item.linkId?.toLowerCase().includes('severity') || item.linkId?.toLowerCase().includes('scale')) {
          const severityValue = item.answer?.[0]?.valueInteger || item.answer?.[0]?.valueDecimal;
          if (severityValue !== undefined) {
            // Match this severity to the most recent region entry
            if (regions.length > 0) {
              regions[regions.length - 1].severity = Number(severityValue);
            }
          }
        }

        // Recursively process nested items
        if (item.item && item.item.length > 0) {
          extractPainData(item.item, currentPath);
        }
      }
    };

    extractPainData(mostRecentResponse.item);

    // If no specific pain data found, try to extract general symptoms
    if (regions.length === 0 && mostRecentResponse.item) {
      const allAnswers = mostRecentResponse.item
        .map((item) => {
          const answers = item.answer?.map((a) => {
            return a.valueString || a.valueCoding?.display || a.valueInteger?.toString() || '';
          });
          return answers && answers.length > 0 ? `${item.text || item.linkId}: ${answers.join(', ')}` : null;
        })
        .filter((text): text is string => text !== null);

      if (allAnswers.length > 0) {
        regions.push({
          name: 'General Symptoms',
          symptoms: allAnswers.join('; '),
          date: lastVisitDate || new Date().toISOString(),
        });
      }
    }

    console.log(`Found ${regions.length} pain regions for patient ${patientId} from visit on ${lastVisitDate}`);
    
    return {
      regions,
      lastVisitDate,
    };
  } catch (error) {
    console.error(`Error getting previous symptoms for patient ${patientId}:`, error);
    return {
      regions: [],
      lastVisitDate: null,
    };
  }
}
