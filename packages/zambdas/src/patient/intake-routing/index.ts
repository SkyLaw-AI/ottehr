import { APIGatewayProxyResult } from 'aws-lambda';
import { Questionnaire, QuestionnaireResponse } from 'fhir/r4b';
import { getSecret, Secrets, SecretsKeys } from 'utils';
import {
  createOystehrClient,
  getAuth0Token,
  topLevelCatch,
  wrapHandler,
  ZambdaInput,
} from '../../shared';
import { determineRoutingQuestionnaire, RoutingAnswers } from '../../shared/intake/routing/routingEngine';
import { getPreviousSymptoms, PreviousSymptomsSummary } from '../../shared/intake/routing/patientStatusDetection';

export interface IntakeRoutingInput {
  secrets: Secrets | null;
  patientId?: string;
  routingAnswers: RoutingAnswers;
}

export interface IntakeRoutingOutput {
  questionnaireUrl: string;
  questionnaireId: string;
  questionnaireName: string;
  previousSymptoms?: PreviousSymptomsSummary;
  routingPath: string;
  requiresLOPTracking: boolean;
  paymentMethodCode: string;
}

// Lifting up value to outside of the handler allows it to stay in memory across warm lambda invocations
let oystehrToken: string;

export const index = wrapHandler(
  'intake-routing',
  async (input: ZambdaInput): Promise<APIGatewayProxyResult> => {
    try {
      console.group('validateRequestParameters');
      const validatedParameters = validateRequestParameters(input);
      const { secrets, patientId, routingAnswers } = validatedParameters;
      console.groupEnd();
      console.debug('validateRequestParameters success');

      if (!oystehrToken) {
        console.log('getting token');
        oystehrToken = await getAuth0Token(secrets);
      } else {
        console.log('already have token');
      }

      const oystehr = createOystehrClient(oystehrToken, secrets);

      // Step 1: Determine routing questionnaire using routing engine
      console.log('Determining routing questionnaire...');
      const routingResult = await determineRoutingQuestionnaire(patientId, routingAnswers, oystehr);
      console.log('Routing result:', JSON.stringify(routingResult, null, 2));

      // Step 2: If existing patient and follow-up questionnaire: Fetch previous symptoms
      let previousSymptoms: PreviousSymptomsSummary | undefined;
      const isFollowUpQuestionnaire = routingResult.questionnaireId.includes('quick-follow-up');
      
      if (patientId && isFollowUpQuestionnaire) {
        console.log('Fetching previous symptoms for follow-up questionnaire...');
        try {
          previousSymptoms = await getPreviousSymptoms(patientId, oystehr);
          console.log('Previous symptoms fetched:', JSON.stringify(previousSymptoms, null, 2));
        } catch (error) {
          console.error('Error fetching previous symptoms:', error);
          // Continue without previous symptoms if fetch fails
        }
      }

      // Step 3: Get questionnaire resource URL
      // The questionnaire ID maps to the config file name
      const questionnaireUrl = `https://ottehr.com/FHIR/Questionnaire/${routingResult.questionnaireId.replace('-questionnaire', '')}`;
      
      // Optionally fetch the questionnaire resource to verify it exists
      // For now, we'll construct the URL based on the routing result
      let questionnaireResource: Questionnaire | undefined;
      try {
        // Try to search for the questionnaire by URL to verify it exists
        const searchResults = (
          await oystehr.fhir.search<Questionnaire>({
            resourceType: 'Questionnaire',
            params: [
              {
                name: 'url',
                value: questionnaireUrl,
              },
            ],
          })
        ).unbundle();

        if (searchResults.length > 0) {
          questionnaireResource = searchResults[0];
        } else {
          console.warn(`Questionnaire not found at URL: ${questionnaireUrl}`);
        }
      } catch (error) {
        console.warn('Could not verify questionnaire exists:', error);
        // Continue anyway - the questionnaire may need to be created
      }

      const response: IntakeRoutingOutput = {
        questionnaireUrl,
        questionnaireId: routingResult.questionnaireId,
        questionnaireName: routingResult.questionnaireName,
        previousSymptoms,
        routingPath: routingResult.routingPath,
        requiresLOPTracking: routingResult.requiresLOPTracking,
        paymentMethodCode: routingResult.paymentMethodCode,
      };

      return {
        statusCode: 200,
        body: JSON.stringify(response),
      };
    } catch (error: any) {
      const ENVIRONMENT = getSecret(SecretsKeys.ENVIRONMENT, input.secrets);
      return topLevelCatch('intake-routing', error, ENVIRONMENT);
    }
  }
);

function validateRequestParameters(input: ZambdaInput): IntakeRoutingInput {
  if (!input.body) {
    throw new Error('Request body is missing');
  }

  let body;
  try {
    body = JSON.parse(input.body);
  } catch (error) {
    throw new Error('Request body is not valid JSON');
  }

  const { patientId, routingAnswers } = body;

  // Validate routingAnswers structure
  if (!routingAnswers || typeof routingAnswers !== 'object') {
    throw new Error('routingAnswers is required and must be an object');
  }

  const { visitType, treatmentType, paymentMethod } = routingAnswers;

  // Validate visitType if provided
  if (visitType !== undefined) {
    const validVisitTypes = ['Personal Injury', "Workers' Compensation", 'General Health & Wellness'];
    if (!validVisitTypes.includes(visitType)) {
      throw new Error(
        `visitType must be one of: ${validVisitTypes.join(', ')}`
      );
    }
  }

  // Validate treatmentType if provided
  if (treatmentType !== undefined) {
    const validTreatmentTypes = ['Chiropractic', 'Pain Management', 'Consultation'];
    if (!validTreatmentTypes.includes(treatmentType)) {
      throw new Error(
        `treatmentType must be one of: ${validTreatmentTypes.join(', ')}`
      );
    }
  }

  return {
    secrets: input.secrets,
    patientId,
    routingAnswers: {
      visitType,
      treatmentType,
      paymentMethod,
    },
  };
}
