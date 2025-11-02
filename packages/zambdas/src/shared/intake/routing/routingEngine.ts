import Oystehr from '@oystehr/sdk';
import {
  getPaymentMethod,
  hasPersonalInjuryHistory,
  hasWorkersCompHistory,
  isNewPatient,
  PaymentMethod,
} from './patientStatusDetection';

export interface RoutingAnswers {
  visitType?: 'Personal Injury' | "Workers' Compensation" | 'General Health & Wellness';
  treatmentType?: 'Chiropractic' | 'Pain Management' | 'Consultation';
  paymentMethod?: string; // Patient-facing answer string
}

export interface RoutingResult {
  questionnaireId: string;
  questionnaireName: string;
  routingPath: string;
  requiresLOPTracking: boolean;
  requiresCMS1500: boolean;
  paymentMethodCode: PaymentMethod;
}

/**
 * Determine which questionnaire to route the patient to based on routing answers and patient status
 * Implements the 8 routing scenarios from the plan
 */

export async function determineRoutingQuestionnaire(
  patientId: string | undefined,
  routingAnswers: RoutingAnswers,
  oystehr: Oystehr
): Promise<RoutingResult> {
  const { visitType, treatmentType, paymentMethod } = routingAnswers;

  // If no patient ID, assume new patient
  let isNew = true;
  let hasPIHistory = false;
  let hasWCHistory = false;
  let detectedPaymentMethod: PaymentMethod = 'unknown';

  if (patientId) {
    try {
      [isNew, hasPIHistory, hasWCHistory, detectedPaymentMethod] = await Promise.all([
        isNewPatient(patientId, oystehr),
        hasPersonalInjuryHistory(patientId, oystehr),
        hasWorkersCompHistory(patientId, oystehr),
        getPaymentMethod(patientId, oystehr),
      ]);
    } catch (error) {
      console.error(`Error detecting patient status for ${patientId}:`, error);
      // Continue with defaults
    }
  }

  // Extract payment method code from answer if provided, otherwise use detected
  let paymentMethodCode: PaymentMethod = detectedPaymentMethod;
  if (paymentMethod) {
    // Map patient-facing answer to payment method code
    if (paymentMethod === 'My health insurance') {
      paymentMethodCode = 'traditional-insurance';
    } else if (paymentMethod === 'Cash or self-pay') {
      paymentMethodCode = 'cash-pay';
    } else if (paymentMethod === 'I was referred by my attorney') {
      paymentMethodCode = 'attorney-lop';
    } else if (paymentMethod === "My employer's workers' compensation insurance") {
      paymentMethodCode = 'workers-comp-carrier';
    }
  }

  // Determine requires flags
  const requiresLOPTracking = paymentMethodCode === 'attorney-lop';
  const requiresCMS1500 =
    visitType === 'Personal Injury' ||
    visitType === "Workers' Compensation" ||
    paymentMethodCode === 'attorney-lop' ||
    paymentMethodCode === 'workers-comp-carrier';

  // Scenario 1: Workers' Compensation (highest priority)
  if (visitType === "Workers' Compensation") {
    return {
      questionnaireId: 'workers-comp-intake-questionnaire',
      questionnaireName: 'Workers Compensation Intake',
      routingPath: 'workers-comp',
      requiresLOPTracking: false,
      requiresCMS1500: true,
      paymentMethodCode: 'workers-comp-carrier',
    };
  }

  // Scenario 2: Personal Injury - New Patient
  if (visitType === 'Personal Injury' && isNew) {
    return {
      questionnaireId: 'personal-injury-intake-questionnaire',
      questionnaireName: 'Personal Injury Intake',
      routingPath: 'pi-new',
      requiresLOPTracking: requiresLOPTracking,
      requiresCMS1500: true,
      paymentMethodCode: paymentMethodCode,
    };
  }

  // Scenario 3: Personal Injury - Existing Patient
  if (visitType === 'Personal Injury' && !isNew) {
    return {
      questionnaireId: 'quick-follow-up-pi-questionnaire',
      questionnaireName: 'Quick Follow-Up (Personal Injury)',
      routingPath: 'pi-follow-up',
      requiresLOPTracking: requiresLOPTracking,
      requiresCMS1500: true,
      paymentMethodCode: paymentMethodCode,
    };
  }

  // Scenario 4: Health & Wellness - Pain Management
  if (visitType === 'General Health & Wellness' && treatmentType === 'Pain Management') {
    return {
      questionnaireId: 'pain-management-intake-questionnaire',
      questionnaireName: 'Pain Management Intake',
      routingPath: 'pain-management',
      requiresLOPTracking: false,
      requiresCMS1500: false,
      paymentMethodCode: paymentMethodCode,
    };
  }

  // Scenario 5: Health & Wellness - Chiropractic - New Patient
  if (
    visitType === 'General Health & Wellness' &&
    treatmentType === 'Chiropractic' &&
    isNew
  ) {
    return {
      questionnaireId: 'non-pi-chiro-intake-questionnaire',
      questionnaireName: 'Non-PI Chiropractic Intake',
      routingPath: 'chiro-new',
      requiresLOPTracking: false,
      requiresCMS1500: false,
      paymentMethodCode: paymentMethodCode,
    };
  }

  // Scenario 6: Health & Wellness - Chiropractic - Existing Patient - Cash
  if (
    visitType === 'General Health & Wellness' &&
    treatmentType === 'Chiropractic' &&
    !isNew &&
    paymentMethodCode === 'cash-pay'
  ) {
    return {
      questionnaireId: 'quick-follow-up-cash-questionnaire',
      questionnaireName: 'Quick Follow-Up (Cash)',
      routingPath: 'chiro-follow-up-cash',
      requiresLOPTracking: false,
      requiresCMS1500: false,
      paymentMethodCode: 'cash-pay',
    };
  }

  // Scenario 7: Health & Wellness - Chiropractic - Existing Patient - Insurance
  if (
    visitType === 'General Health & Wellness' &&
    treatmentType === 'Chiropractic' &&
    !isNew &&
    (paymentMethodCode === 'traditional-insurance' || paymentMethodCode === 'unknown')
  ) {
    return {
      questionnaireId: 'quick-follow-up-insured-questionnaire',
      questionnaireName: 'Quick Follow-Up (Insured)',
      routingPath: 'chiro-follow-up-insured',
      requiresLOPTracking: false,
      requiresCMS1500: false,
      paymentMethodCode: paymentMethodCode === 'unknown' ? 'traditional-insurance' : paymentMethodCode,
    };
  }

  // Scenario 8: Existing Patient with PI/WC History (fallback/catch-all)
  if (!isNew && (hasPIHistory || hasWCHistory)) {
    return {
      questionnaireId: 'quick-follow-up-pi-questionnaire',
      questionnaireName: 'Quick Follow-Up (Personal Injury)',
      routingPath: 'pi-wc-history-follow-up',
      requiresLOPTracking: hasPIHistory && paymentMethodCode === 'attorney-lop',
      requiresCMS1500: true,
      paymentMethodCode: paymentMethodCode,
    };
  }

  // Default fallback - should rarely be reached
  console.warn(
    `No matching routing scenario for: visitType=${visitType}, treatmentType=${treatmentType}, isNew=${isNew}, paymentMethod=${paymentMethodCode}`
  );
  return {
    questionnaireId: 'non-pi-chiro-intake-questionnaire',
    questionnaireName: 'Non-PI Chiropractic Intake (Default)',
    routingPath: 'default',
    requiresLOPTracking: false,
    requiresCMS1500: false,
    paymentMethodCode: paymentMethodCode,
  };
}
