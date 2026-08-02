"use client";

import { useState, useRef, useEffect } from "react";
import { Search, Filter, ChevronDown } from "lucide-react";
import { PoolsPageHeaderProps } from "@/lib/interfaces";
import {
  POOLS_LIST_STATUS_OPTIONS,
  PoolsListStatusFilter,
} from "@/lib/enums";

export function PoolsPageHeader({
  title,
  description,
  searchValue,
  onSearchChange,
  statusFilter = PoolsListStatusFilter.ALL,
  onStatusFilterChange,
  rightElement,
}: PoolsPageHeaderProps) {
  const [filterOpen, setFilterOpen] = useState(false);
  const filterRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (filterRef.current && !filterRef.current.contains(e.target as Node)) {
        setFilterOpen(false);
      }
    }
    if (filterOpen) {
      document.addEventListener("mousedown", handleClickOutside);
      return () => document.removeEventListener("mousedown", handleClickOutside);
    }
  }, [filterOpen]);

  const currentLabel =
    POOLS_LIST_STATUS_OPTIONS.find((o) => o.value === statusFilter)?.label ??
    "All";

  return (
    <div className="flex flex-col md:flex-row justify-between items-start md:items-end gap-4">
      <div>
        <h1 className="text-4xl font-black font-display italic uppercase mb-2">
          {title}
        </h1>
        <p className="text-muted-foreground">{description}</p>
      </div>

      <div className="flex flex-wrap items-center gap-2 w-full md:w-auto">
        {onStatusFilterChange && (
          <div className="relative" ref={filterRef}>
            <button
              type="button"
              onClick={() => setFilterOpen((o) => !o)}
              className="flex items-center gap-2 px-3 py-2 bg-white/5 border border-white/10 rounded-lg hover:bg-white/10 text-sm"
              aria-expanded={filterOpen}
              aria-haspopup="listbox"
              aria-label={`Filter: ${currentLabel}. Click to change.`}
            >
              <Filter className="w-4 h-4 shrink-0" />
              <span>{currentLabel}</span>
              <ChevronDown className={`w-4 h-4 shrink-0 transition-transform ${filterOpen ? "rotate-180" : ""}`} />
            </button>
            {filterOpen && (
              <div
                className="absolute top-full left-0 mt-1 z-[100] min-w-[140px] bg-card border border-white/10 rounded-lg shadow-lg py-1"
                role="listbox"
                aria-label="Filter options"
              >
                {POOLS_LIST_STATUS_OPTIONS.map((opt) => (
                  <button
                    key={opt.value}
                    type="button"
                    role="option"
                    aria-selected={statusFilter === opt.value}
                    onClick={() => {
                      onStatusFilterChange(opt.value);
                      setFilterOpen(false);
                    }}
                    className={`w-full text-left px-3 py-2 text-sm hover:bg-white/10 ${
                      statusFilter === opt.value ? "bg-primary/20 text-primary" : ""
                    }`}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            )}
          </div>
        )}
        {onSearchChange && (
          <div className="relative flex-1 md:w-64 min-w-0">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <input
              type="text"
              placeholder="Search pools..."
              value={searchValue}
              onChange={(e) => onSearchChange(e.target.value)}
              className="w-full bg-black/20 border border-white/10 rounded-lg pl-10 pr-4 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-primary"
            />
          </div>
        )}
        {rightElement}
      </div>
    </div>
  );
}
