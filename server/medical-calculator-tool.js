import { BaseTool } from './base-tool.js';

/**
 * Tool for performing medical calculations
 */
export class MedicalCalculatorTool extends BaseTool {
  constructor(cacheService) {
    super(cacheService);
  }

  /**
   * Calculate Body Mass Index (BMI)
   */
  calculateBmi(heightMeters, weightKg) {
    if (!heightMeters || !weightKg) {
      return this.formatErrorResponse('Height and weight are required');
    }
    const bmi = weightKg / (heightMeters * heightMeters);
    return this.formatSuccessResponse({ bmi: bmi.toFixed(2) });
  }
}

export default MedicalCalculatorTool;
