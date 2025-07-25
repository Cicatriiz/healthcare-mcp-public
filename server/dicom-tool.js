import { BaseTool } from './base-tool.js';
import dicomParser from 'dicom-parser';
import fs from 'fs';

/**
 * Tool for interacting with DICOM files
 */
export class DicomTool extends BaseTool {
  constructor(cacheService) {
    super(cacheService);
  }

  /**
   * Extract metadata from a DICOM file
   */
  extractMetadata(filePath) {
    if (!filePath) {
      return this.formatErrorResponse('File path is required');
    }

    try {
      const dicomFile = fs.readFileSync(filePath);
      let dataSet;
      try {
        dataSet = dicomParser.parseDicom(dicomFile);
      } catch (e) {
        throw new Error(`dicom-parser failed to parse file: ${e.message}`);
      }

      const patientName = dataSet.string('x00100010');
      const patientId = dataSet.string('x00100020');
      const studyDescription = dataSet.string('x00081030');
      const seriesDescription = dataSet.string('x0008103e');

      return this.formatSuccessResponse({
        patientName,
        patientId,
        studyDescription,
        seriesDescription,
      });
    } catch (error) {
      return this.formatErrorResponse(`Error parsing DICOM file: ${error.message}`);
    }
  }
}

export default DicomTool;
