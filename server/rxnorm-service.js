#!/usr/bin/env node

/**
 * RxNorm Service - Drug Name Normalization
 * Uses National Library of Medicine RxNorm API (FREE)
 * https://rxnav.nlm.nih.gov/RxNormAPIs.html
 */

import fetch from 'node-fetch';

export class RxNormService {
  constructor(cacheService) {
    this.cache = cacheService;
    this.baseUrl = 'https://rxnav.nlm.nih.gov/REST';
  }

  /**
   * Normalize a drug name to RxCUI (RxNorm Concept Unique Identifier)
   * This is the foundation for matching drugs across different databases
   *
   * @param {string} drugName - Drug name to normalize (e.g., "Amoxicillin", "AMOXICILLIN 500MG CAP")
   * @returns {Promise<Object>} - { status, rxcui, name, synonyms, tty }
   */
  async normalizeDrugName(drugName) {
    if (!drugName || typeof drugName !== 'string') {
      return {
        status: 'error',
        error_message: 'Drug name is required'
      };
    }

    const cacheKey = `rxnorm:normalize:${drugName.toLowerCase()}`;
    const cached = this.cache?.get(cacheKey);
    if (cached) {
      return cached;
    }

    try {
      // First try approximate match (handles typos, case insensitivity)
      const url = `${this.baseUrl}/approximateTerm.json?term=${encodeURIComponent(drugName)}&maxEntries=5`;
      const response = await fetch(url);

      if (!response.ok) {
        throw new Error(`RxNorm API error: ${response.status}`);
      }

      const data = await response.json();

      if (!data.approximateGroup || !data.approximateGroup.candidate) {
        return {
          status: 'not_found',
          query: drugName,
          message: 'No matching drugs found in RxNorm'
        };
      }

      // Get the best match (first candidate)
      const candidates = Array.isArray(data.approximateGroup.candidate)
        ? data.approximateGroup.candidate
        : [data.approximateGroup.candidate];

      const bestMatch = candidates[0];

      // Get detailed information about this RxCUI
      const details = await this.getDrugDetails(bestMatch.rxcui);

      const result = {
        status: 'success',
        rxcui: bestMatch.rxcui,
        name: bestMatch.name,
        score: bestMatch.score,
        rank: bestMatch.rank,
        details: details.status === 'success' ? details.data : null,
        all_candidates: candidates.slice(0, 5).map(c => ({
          rxcui: c.rxcui,
          name: c.name,
          score: c.score
        }))
      };

      this.cache?.set(cacheKey, result);
      return result;

    } catch (error) {
      return {
        status: 'error',
        error_message: `RxNorm normalization failed: ${error.message}`
      };
    }
  }

  /**
   * Get detailed drug information by RxCUI
   *
   * @param {string} rxcui - RxNorm Concept Unique Identifier
   * @returns {Promise<Object>} - Drug properties, synonyms, related concepts
   */
  async getDrugDetails(rxcui) {
    if (!rxcui) {
      return {
        status: 'error',
        error_message: 'RxCUI is required'
      };
    }

    const cacheKey = `rxnorm:details:${rxcui}`;
    const cached = this.cache?.get(cacheKey);
    if (cached) {
      return cached;
    }

    try {
      // Get RxCUI properties
      const propsUrl = `${this.baseUrl}/rxcui/${rxcui}/properties.json`;
      const propsResponse = await fetch(propsUrl);

      if (!propsResponse.ok) {
        throw new Error(`RxNorm API error: ${propsResponse.status}`);
      }

      const propsData = await propsResponse.json();

      if (!propsData.properties) {
        return {
          status: 'not_found',
          rxcui: rxcui
        };
      }

      const props = propsData.properties;

      // Get synonyms
      const synonymsUrl = `${this.baseUrl}/rxcui/${rxcui}/allrelated.json`;
      const synonymsResponse = await fetch(synonymsUrl);
      const synonymsData = await synonymsResponse.json();

      const synonyms = [];
      if (synonymsData.allRelatedGroup && synonymsData.allRelatedGroup.conceptGroup) {
        synonymsData.allRelatedGroup.conceptGroup.forEach(group => {
          if (group.conceptProperties) {
            const concepts = Array.isArray(group.conceptProperties)
              ? group.conceptProperties
              : [group.conceptProperties];
            concepts.forEach(concept => {
              if (concept.name && !synonyms.includes(concept.name)) {
                synonyms.push(concept.name);
              }
            });
          }
        });
      }

      const result = {
        status: 'success',
        data: {
          rxcui: props.rxcui,
          name: props.name,
          synonym: props.synonym,
          tty: props.tty, // Term Type (e.g., SCD = Semantic Clinical Drug)
          language: props.language,
          suppress: props.suppress,
          umlscui: props.umlscui,
          synonyms: synonyms.slice(0, 20) // Limit to 20 synonyms
        }
      };

      this.cache?.set(cacheKey, result);
      return result;

    } catch (error) {
      return {
        status: 'error',
        error_message: `Failed to get drug details: ${error.message}`
      };
    }
  }

  /**
   * Find therapeutic alternatives for a drug
   * Uses RxClass API to find drugs in the same therapeutic class
   *
   * @param {string} rxcui - RxNorm Concept Unique Identifier
   * @returns {Promise<Object>} - Therapeutic class and related drugs
   */
  async getTherapeuticAlternatives(rxcui) {
    if (!rxcui) {
      return {
        status: 'error',
        error_message: 'RxCUI is required'
      };
    }

    const cacheKey = `rxnorm:alternatives:${rxcui}`;
    const cached = this.cache?.get(cacheKey);
    if (cached) {
      return cached;
    }

    try {
      // Get drug classes using RxClass API
      const classUrl = `https://rxnav.nlm.nih.gov/REST/rxclass/class/byRxcui.json?rxcui=${rxcui}&relaSource=ATC`;
      const classResponse = await fetch(classUrl);

      if (!classResponse.ok) {
        throw new Error(`RxClass API error: ${classResponse.status}`);
      }

      const classData = await classResponse.json();

      if (!classData.rxclassMinConceptList || !classData.rxclassMinConceptList.rxclassMinConcept) {
        return {
          status: 'not_found',
          rxcui: rxcui,
          message: 'No therapeutic class information available'
        };
      }

      const classes = Array.isArray(classData.rxclassMinConceptList.rxclassMinConcept)
        ? classData.rxclassMinConceptList.rxclassMinConcept
        : [classData.rxclassMinConceptList.rxclassMinConcept];

      // Get drugs in the same class (for the most specific class)
      const primaryClass = classes[classes.length - 1]; // Most specific class is usually last

      const membersUrl = `https://rxnav.nlm.nih.gov/REST/rxclass/classMembers.json?classId=${primaryClass.classId}&relaSource=ATC`;
      const membersResponse = await fetch(membersUrl);
      const membersData = await membersResponse.json();

      const alternatives = [];
      if (membersData.drugMemberGroup && membersData.drugMemberGroup.drugMember) {
        const members = Array.isArray(membersData.drugMemberGroup.drugMember)
          ? membersData.drugMemberGroup.drugMember
          : [membersData.drugMemberGroup.drugMember];

        members.forEach(member => {
          if (member.minConcept && member.minConcept.rxcui !== rxcui) {
            alternatives.push({
              rxcui: member.minConcept.rxcui,
              name: member.minConcept.name
            });
          }
        });
      }

      const result = {
        status: 'success',
        rxcui: rxcui,
        therapeutic_classes: classes.map(c => ({
          classId: c.classId,
          className: c.className,
          classType: c.classType
        })),
        primary_class: {
          classId: primaryClass.classId,
          className: primaryClass.className
        },
        alternatives: alternatives.slice(0, 20), // Limit to 20 alternatives
        total_alternatives: alternatives.length
      };

      this.cache?.set(cacheKey, result);
      return result;

    } catch (error) {
      return {
        status: 'error',
        error_message: `Failed to get therapeutic alternatives: ${error.message}`
      };
    }
  }

  /**
   * Batch normalize multiple drug names
   * Useful for processing formulary lists
   *
   * @param {string[]} drugNames - Array of drug names
   * @returns {Promise<Object>} - Map of drug names to RxCUI codes
   */
  async batchNormalize(drugNames) {
    if (!Array.isArray(drugNames) || drugNames.length === 0) {
      return {
        status: 'error',
        error_message: 'Array of drug names is required'
      };
    }

    try {
      const results = {};
      const errors = [];

      // Process in parallel with limit to avoid rate limiting
      const batchSize = 5;
      for (let i = 0; i < drugNames.length; i += batchSize) {
        const batch = drugNames.slice(i, i + batchSize);
        const promises = batch.map(async (name) => {
          try {
            const result = await this.normalizeDrugName(name);
            results[name] = result;
          } catch (error) {
            errors.push({ drug: name, error: error.message });
          }
        });
        await Promise.all(promises);
      }

      return {
        status: 'success',
        total: drugNames.length,
        successful: Object.keys(results).filter(k => results[k].status === 'success').length,
        not_found: Object.keys(results).filter(k => results[k].status === 'not_found').length,
        errors: errors.length,
        results: results
      };

    } catch (error) {
      return {
        status: 'error',
        error_message: `Batch normalization failed: ${error.message}`
      };
    }
  }
}

export default RxNormService;
