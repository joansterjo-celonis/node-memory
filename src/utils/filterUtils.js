// src/utils/filterUtils.js
// Shared helpers for filter nodes.

const DEFAULT_FILTER_OPERATOR = 'equals';

const resolveFilterMode = (filter) => {
  if (!filter) return 'operator';
  if (filter.mode) return filter.mode;
  if (filter.operator === 'in') return 'attribute';
  return 'operator';
};

const normalizeFilters = (params = {}) => {
  if (!params) return [];
  if (Array.isArray(params.filters)) {
    return params.filters.map((filter) => ({
      ...filter,
      mode: resolveFilterMode(filter),
      field: filter?.field || '',
      operator: filter?.operator || DEFAULT_FILTER_OPERATOR,
      value: filter?.value ?? ''
    }));
  }
  if (params.field) {
    return [{
      mode: resolveFilterMode(params),
      field: params.field || '',
      operator: params.operator || DEFAULT_FILTER_OPERATOR,
      value: params.value ?? ''
    }];
  }
  return [];
};

export { DEFAULT_FILTER_OPERATOR, normalizeFilters, resolveFilterMode };
