"use client";

import Layout from "@/components/layout";
import { PoolCard } from "@/components/pool-card";
import { useState, useEffect } from "react";
import Link from "next/link";
import { PoolsPageHeader } from "@/components/pools/pools-page-header";
import { Pagination } from "@/components/pools/pagination";
import { StaggerGroup, StaggerItem } from "@/components/motion/reveal";
import { usePools } from "@/lib/hooks/use-pools";
import { Plus } from "lucide-react";
import { PoolType, PoolsListStatusFilter } from "@/lib/enums";
import type { Pool } from "@/lib/types";

const SEARCH_DEBOUNCE_MS = 400;
const PAGE_SIZE = 12;

function getPublicPoolsEmptyMessage(
  statusFilter: PoolsListStatusFilter,
  hasSearch: boolean
): string {
  if (hasSearch && statusFilter !== PoolsListStatusFilter.ALL) {
    return "No public pools match your search and filter. Try different keywords or filters.";
  }
  if (hasSearch) {
    return "No public pools match your search. Try different keywords.";
  }
  if (statusFilter === PoolsListStatusFilter.OPEN) {
    return "No open public pools right now. Try a different filter.";
  }
  if (statusFilter === PoolsListStatusFilter.COMPLETED) {
    return "No completed public pools found. Try a different filter.";
  }
  return "No public pools found. Be the first to create one!";
}

export default function PublicPools() {
  const [searchTerm, setSearchTerm] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<PoolsListStatusFilter>(
    PoolsListStatusFilter.ALL
  );
  const [page, setPage] = useState(1);

  useEffect(() => {
    const t = setTimeout(() => {
      setDebouncedSearch(searchTerm);
      // Reset pagination alongside the debounced search update (async, so it
      // does not run synchronously within the effect body).
      setPage(1);
    }, SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(t);
  }, [searchTerm]);

  // Reset pagination when the status filter changes (handled in the event
  // handler instead of an effect).
  const handleStatusFilterChange = (value: PoolsListStatusFilter) => {
    if (value !== statusFilter) setPage(1);
    setStatusFilter(value);
  };

  const { data, isLoading, error } = usePools({
    type: PoolType.PUBLIC,
    status: statusFilter,
    search: debouncedSearch,
    page,
    limit: PAGE_SIZE,
  });

  const pools = data?.pools ?? [];
  const total = data?.total ?? 0;
  const totalPages = data?.totalPages ?? 1;

  if (error) {
    return (
      <Layout>
        <div className="space-y-8">
          <PoolsPageHeader
            title="Public Pools"
            description="Join the biggest pools and compete against the world."
            searchValue={searchTerm}
            onSearchChange={setSearchTerm}
            statusFilter={statusFilter}
            onStatusFilterChange={handleStatusFilterChange}
            rightElement={
              <Link href="/create-pool">
                <div className="btn-3d-primary px-6 py-2 text-sm flex items-center gap-2 cursor-pointer">
                  <Plus className="w-4 h-4" /> Create New Pool
                </div>
              </Link>
            }
          />
          <div className="text-center py-12">
            <p className="text-destructive">
              Failed to load pools. Please try again later.
            </p>
          </div>
        </div>
      </Layout>
    );
  }

  return (
    <Layout>
      <div className="space-y-8">
        <PoolsPageHeader
          title="Public Pools"
          description="Join the biggest pools and compete against the world."
          searchValue={searchTerm}
          onSearchChange={setSearchTerm}
          statusFilter={statusFilter}
          onStatusFilterChange={handleStatusFilterChange}
          rightElement={
            <Link href="/create-pool">
              <div className="btn-3d-primary px-6 py-2 text-sm flex items-center gap-2 cursor-pointer">
                <Plus className="w-4 h-4" /> Create New Pool
              </div>
            </Link>
          }
        />

        {isLoading ? (
          <div
            className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6"
            aria-hidden="true"
          >
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="skeleton h-52" />
            ))}
          </div>
        ) : pools.length === 0 ? (
          <div className="text-center py-12">
            <p className="text-muted-foreground">
              {getPublicPoolsEmptyMessage(statusFilter, debouncedSearch.length > 0)}
            </p>
          </div>
        ) : (
          <>
            <StaggerGroup className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {pools.map((pool: Pool) => (
                <StaggerItem key={pool.id}>
                  <PoolCard pool={pool} />
                </StaggerItem>
              ))}
            </StaggerGroup>
            <Pagination
              page={page}
              totalPages={totalPages}
              total={total}
              limit={PAGE_SIZE}
              onPageChange={setPage}
              isLoading={isLoading}
            />
          </>
        )}
      </div>
    </Layout>
  );
}
