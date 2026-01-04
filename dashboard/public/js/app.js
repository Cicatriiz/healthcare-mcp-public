/**
 * Main Application Logic for FDA Drug Shortage Dashboard
 */

// State
let currentPage = 1;
let currentFilters = {
    query: '',
    status: 'active',
    therapeutic_category: '',
    dosage_form: '',
    manufacturer: '',
    limit: 20,
    sort: 'initial_posting_date:desc'
};
let currentData = null;

// Initialize on page load
document.addEventListener('DOMContentLoaded', async () => {
    console.log('[App] Initializing dashboard...');

    // Load dropdown data
    await loadFilterDropdowns();

    // Load summary stats
    await loadSummaryStats();

    // Load initial shortages
    await loadShortages();

    // Set up event listeners
    setupEventListeners();

    // Update last updated time
    updateLastUpdated();
});

/**
 * Set up all event listeners
 */
function setupEventListeners() {
    // Search button
    document.getElementById('search-btn').addEventListener('click', () => {
        currentPage = 1;
        updateFiltersFromInputs();
        loadShortages();
    });

    // Clear button
    document.getElementById('clear-btn').addEventListener('click', () => {
        clearFilters();
    });

    // Enter key in search input
    document.getElementById('search-input').addEventListener('keypress', (e) => {
        if (e.key === 'Enter') {
            currentPage = 1;
            updateFiltersFromInputs();
            loadShortages();
        }
    });

    // Limit change
    document.getElementById('limit-select').addEventListener('change', () => {
        currentPage = 1;
        currentFilters.limit = parseInt(document.getElementById('limit-select').value);
        loadShortages();
    });

    // Filter changes
    ['status-filter', 'category-filter', 'form-filter', 'manufacturer-filter', 'sort-select'].forEach(id => {
        document.getElementById(id).addEventListener('change', () => {
            currentPage = 1;
            updateFiltersFromInputs();
            loadShortages();
        });
    });
}

/**
 * Update filters object from form inputs
 */
function updateFiltersFromInputs() {
    currentFilters = {
        query: document.getElementById('search-input').value.trim(),
        status: document.getElementById('status-filter').value,
        therapeutic_category: document.getElementById('category-filter').value,
        dosage_form: document.getElementById('form-filter').value,
        manufacturer: document.getElementById('manufacturer-filter').value,
        limit: parseInt(document.getElementById('limit-select').value),
        sort: document.getElementById('sort-select').value
    };
}

/**
 * Clear all filters
 */
function clearFilters() {
    document.getElementById('search-input').value = '';
    document.getElementById('status-filter').value = 'active';
    document.getElementById('category-filter').value = '';
    document.getElementById('form-filter').value = '';
    document.getElementById('manufacturer-filter').value = '';
    document.getElementById('sort-select').value = 'initial_posting_date:desc';

    currentPage = 1;
    updateFiltersFromInputs();
    loadShortages();
}

/**
 * Load dropdown filter data
 */
async function loadFilterDropdowns() {
    try {
        // Load therapeutic categories
        const categoriesResult = await api.getTherapeuticCategories();
        if (categoriesResult.status === 'success' && categoriesResult.categories) {
            const categorySelect = document.getElementById('category-filter');
            categoriesResult.categories.forEach(category => {
                const option = document.createElement('option');
                option.value = category;
                option.textContent = category;
                categorySelect.appendChild(option);
            });
        }

        // Load manufacturers
        const manufacturersResult = await api.getManufacturers();
        if (manufacturersResult.status === 'success' && manufacturersResult.manufacturers) {
            const manufacturerSelect = document.getElementById('manufacturer-filter');
            manufacturersResult.manufacturers.forEach(manufacturer => {
                const option = document.createElement('option');
                option.value = manufacturer;
                option.textContent = manufacturer;
                manufacturerSelect.appendChild(option);
            });
        }
    } catch (error) {
        console.error('[App] Error loading filter dropdowns:', error);
    }
}

/**
 * Load summary statistics
 */
async function loadSummaryStats() {
    try {
        const result = await api.getStats();

        if (result.status === 'success') {
            const statsContainer = document.getElementById('stats-container');
            statsContainer.innerHTML = `
                <div class="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
                    <div class="text-sm font-medium text-gray-600">Active Shortages</div>
                    <div class="mt-2 text-3xl font-bold text-danger">${result.total_active || 0}</div>
                </div>
                <div class="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
                    <div class="text-sm font-medium text-gray-600">Resolved</div>
                    <div class="mt-2 text-3xl font-bold text-success">${result.total_resolved || 0}</div>
                </div>
                <div class="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
                    <div class="text-sm font-medium text-gray-600">Total All Time</div>
                    <div class="mt-2 text-3xl font-bold text-gray-900">${result.total_all || 0}</div>
                </div>
            `;
        }
    } catch (error) {
        console.error('[App] Error loading stats:', error);
    }
}

/**
 * Load shortages list
 */
async function loadShortages() {
    const loadingEl = document.getElementById('loading');
    const errorEl = document.getElementById('error');
    const resultsEl = document.getElementById('results-container');

    try {
        // Show loading
        loadingEl.classList.remove('hidden');
        errorEl.classList.add('hidden');
        resultsEl.classList.add('opacity-50');

        // Prepare request params
        const params = {
            ...currentFilters,
            page: currentPage
        };

        // Make API call
        const result = await api.getShortages(params);

        if (result.status === 'success') {
            currentData = result;
            renderShortages(result.data, result.pagination);
            renderActiveFilters();
        } else {
            throw new Error(result.error_message || 'Unknown error');
        }

    } catch (error) {
        console.error('[App] Error loading shortages:', error);
        showError(error.message);
    } finally {
        loadingEl.classList.add('hidden');
        resultsEl.classList.remove('opacity-50');
    }
}

/**
 * Render shortages table
 */
function renderShortages(shortages, pagination) {
    const tbody = document.getElementById('shortages-tbody');
    const resultsCount = document.getElementById('results-count');

    resultsCount.textContent = pagination.total || 0;

    if (!shortages || shortages.length === 0) {
        tbody.innerHTML = `
            <tr>
                <td colspan="7" class="px-6 py-12 text-center text-gray-500">
                    <div class="text-lg font-medium mb-2">No shortages found</div>
                    <div class="text-sm">Try adjusting your filters or search query</div>
                </td>
            </tr>
        `;
        renderPagination(pagination);
        return;
    }

    tbody.innerHTML = shortages.map(shortage => {
        const statusBadge = shortage.status === 'active'
            ? '<span class="px-2 py-1 text-xs font-semibold rounded-full bg-red-100 text-red-800">Active</span>'
            : '<span class="px-2 py-1 text-xs font-semibold rounded-full bg-green-100 text-green-800">Resolved</span>';

        const categories = (shortage.therapeutic_categories || []).slice(0, 2).join(', ');
        const categoriesDisplay = categories || '<span class="text-gray-400">Not specified</span>';

        const dateFormatted = shortage.initial_date
            ? new Date(shortage.initial_date).toLocaleDateString()
            : 'N/A';

        return `
            <tr class="hover:bg-gray-50 cursor-pointer" onclick="viewShortageDetail('${shortage.ndc}')">
                <td class="px-6 py-4">
                    <div class="font-medium text-gray-900">${escapeHtml(shortage.generic_name || 'N/A')}</div>
                    ${shortage.brand_name ? `<div class="text-sm text-gray-500">${escapeHtml(shortage.brand_name)}</div>` : ''}
                    <div class="text-xs text-gray-400 mt-1">NDC: ${shortage.ndc}</div>
                </td>
                <td class="px-6 py-4 text-sm text-gray-900">${escapeHtml(shortage.manufacturer || 'N/A')}</td>
                <td class="px-6 py-4">
                    <div class="text-sm text-gray-900">${escapeHtml(shortage.dosage_form || 'N/A')}</div>
                    <div class="text-xs text-gray-500">${escapeHtml(shortage.route || 'N/A')}</div>
                </td>
                <td class="px-6 py-4 text-sm text-gray-600">${categoriesDisplay}</td>
                <td class="px-6 py-4">${statusBadge}</td>
                <td class="px-6 py-4 text-sm text-gray-600">${dateFormatted}</td>
                <td class="px-6 py-4">
                    <button onclick="event.stopPropagation(); viewShortageDetail('${shortage.ndc}')"
                            class="text-primary hover:text-blue-700 font-medium text-sm">
                        View Details →
                    </button>
                </td>
            </tr>
        `;
    }).join('');

    renderPagination(pagination);
}

/**
 * Render pagination controls
 */
function renderPagination(pagination) {
    const paginationEl = document.getElementById('pagination');

    if (!pagination || pagination.totalPages <= 1) {
        paginationEl.innerHTML = '';
        return;
    }

    const prevDisabled = !pagination.hasPrev;
    const nextDisabled = !pagination.hasNext;

    paginationEl.innerHTML = `
        <div class="flex items-center justify-between w-full">
            <div class="text-sm text-gray-700">
                Showing page <span class="font-medium">${pagination.page}</span> of
                <span class="font-medium">${pagination.totalPages}</span>
                (<span class="font-medium">${pagination.total}</span> total results)
            </div>
            <div class="flex space-x-2">
                <button onclick="goToPage(${currentPage - 1})" ${prevDisabled ? 'disabled' : ''}
                        class="px-4 py-2 border border-gray-300 rounded-md text-sm font-medium
                               ${prevDisabled ? 'bg-gray-100 text-gray-400 cursor-not-allowed' : 'bg-white text-gray-700 hover:bg-gray-50'}">
                    Previous
                </button>
                <button onclick="goToPage(${currentPage + 1})" ${nextDisabled ? 'disabled' : ''}
                        class="px-4 py-2 border border-gray-300 rounded-md text-sm font-medium
                               ${nextDisabled ? 'bg-gray-100 text-gray-400 cursor-not-allowed' : 'bg-white text-gray-700 hover:bg-gray-50'}">
                    Next
                </button>
            </div>
        </div>
    `;
}

/**
 * Navigate to specific page
 */
function goToPage(page) {
    if (page < 1) return;
    currentPage = page;
    loadShortages();
}

/**
 * Render active filters display
 */
function renderActiveFilters() {
    const container = document.getElementById('active-filters');
    const filters = [];

    if (currentFilters.query) {
        filters.push({ label: 'Search', value: currentFilters.query });
    }
    if (currentFilters.status && currentFilters.status !== 'all') {
        filters.push({ label: 'Status', value: currentFilters.status });
    }
    if (currentFilters.therapeutic_category) {
        filters.push({ label: 'Category', value: currentFilters.therapeutic_category });
    }
    if (currentFilters.dosage_form) {
        filters.push({ label: 'Form', value: currentFilters.dosage_form });
    }
    if (currentFilters.manufacturer) {
        filters.push({ label: 'Manufacturer', value: currentFilters.manufacturer });
    }

    if (filters.length === 0) {
        container.innerHTML = '';
        return;
    }

    container.innerHTML = `
        <div class="text-sm font-medium text-gray-600">Active Filters:</div>
        ${filters.map(f => `
            <span class="inline-flex items-center px-3 py-1 rounded-full text-sm bg-primary text-white">
                ${f.label}: ${escapeHtml(f.value)}
            </span>
        `).join('')}
    `;
}

/**
 * View shortage detail (navigate to detail page)
 */
function viewShortageDetail(ndc) {
    window.location.href = `detail.html?ndc=${encodeURIComponent(ndc)}`;
}

/**
 * Show error message
 */
function showError(message) {
    const errorEl = document.getElementById('error');
    const errorMessageEl = document.getElementById('error-message');

    errorMessageEl.textContent = message;
    errorEl.classList.remove('hidden');
}

/**
 * Update last updated timestamp
 */
function updateLastUpdated() {
    const lastUpdatedEl = document.getElementById('last-updated');
    if (lastUpdatedEl) {
        lastUpdatedEl.textContent = new Date().toLocaleString();
    }
}

/**
 * Escape HTML to prevent XSS
 */
function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}
