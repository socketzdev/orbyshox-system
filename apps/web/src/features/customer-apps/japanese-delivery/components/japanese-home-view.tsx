import React, { useState, useMemo } from 'react';
import { JapaneseHeader } from './japanese-header';
import { JapaneseHeroBanner } from './japanese-hero-banner';
import { JapaneseSearchBar } from './japanese-search-bar';
import { JapaneseSpecialOffers } from './japanese-special-offers';
import { JapaneseCategories } from './japanese-categories';
import { JapaneseProductGrid } from './japanese-product-grid';
import { JAPANESE_PRODUCTS } from '../japanese-data';

export const JapaneseHomeView: React.FC = () => {
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('todos');

  // Filter products by category and search term
  const filteredProducts = useMemo(() => {
    return JAPANESE_PRODUCTS.filter(product => {
      const matchesCategory =
        selectedCategory === 'todos' || product.category === selectedCategory;

      const cleanQuery = searchQuery.trim().toLowerCase();
      const matchesSearch =
        !cleanQuery ||
        product.name.toLowerCase().includes(cleanQuery) ||
        product.description.toLowerCase().includes(cleanQuery) ||
        product.tags.some(t => t.toLowerCase().includes(cleanQuery));

      return matchesCategory && matchesSearch;
    });
  }, [selectedCategory, searchQuery]);

  return (
    <div className="pb-28">
      {/* Brand Header */}
      <JapaneseHeader />

      {/* Search Bar */}
      <JapaneseSearchBar searchQuery={searchQuery} setSearchQuery={setSearchQuery} />

      {/* If searching, only show results grid, else show full home logic */}
      {!searchQuery && (
        <>
          {/* Hero Banner: Sakura Wave */}
          <JapaneseHeroBanner />

          {/* Special Offers Carousel */}
          <JapaneseSpecialOffers />
        </>
      )}

      {/* Category Chips */}
      <JapaneseCategories
        selectedCategory={selectedCategory}
        setSelectedCategory={setSelectedCategory}
      />

      {/* 2-Column Product Grid (Chef's Selections) */}
      <JapaneseProductGrid products={filteredProducts} />
    </div>
  );
};
