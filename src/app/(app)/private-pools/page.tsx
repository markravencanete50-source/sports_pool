"use client";

import Layout from "@/components/layout";
import { PoolCard } from "@/components/pool-card";
import { Plus, Lock, Loader2 } from "lucide-react";
import Link from "next/link";
import { useState, useEffect } from "react";
import { PoolsPageHeader } from "@/components/pools/pools-page-header";
import { EmptyState } from "@/components/pools/empty-state";
import { Pagination } from "@/components/pools/pagination";
import { usePools } from "@/lib/hooks/use-pools";
import { PoolType, PoolsListStatusFilter } from "@/lib/enums";

const SEARCH_DEBOUNCE_MS = 400;
const PAGE_SIZE = 12;

function getPrivatePoolsEmptyState(
  statusFilter: PoolsListStatusFilter,
  hasSearch: boolean
): { title: string; description: string } {
  if (hasSearch || statusFilter !== PoolsListStatusFilter.ALL) {
    return {
      title: "No matching private pools",
      description:
        "No private pools match your search or filter. Try adjusting your filters or create a new pool.",
    };
  }
  return {
    title: "No Private Pools Yet",
    description: "Start a league and invite your friends to play.",
  };
}

export default function PrivatePools() {
  const [searchTerm, setSearchTerm] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<PoolsListStatusFilter>(
    PoolsListStatusFilter.ALL
  );
  const [page, setPage] = useState(1);

  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(searchTerm), SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(t);
  }, [searchTerm]);

  useEffect(() => {
    setPage(1);
  }, [debouncedSearch, statusFilter]);

  const { data, isLoading, error } = usePools({
    type: PoolType.PRIVATE,
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
            title="Private Pools"
            description="Invite-only leagues for you and your friends."
            searchValue={searchTerm}
            onSearchChange={setSearchTerm}
            statusFilter={statusFilter}
            onStatusFilterChange={setStatusFilter}
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
          title="Private Pools"
          description="Invite-only leagues for you and your friends."
          searchValue={searchTerm}
          onSearchChange={setSearchTerm}
          statusFilter={statusFilter}
          onStatusFilterChange={setStatusFilter}
          rightElement={
            <Link href="/create-pool">
              <div className="btn-3d-primary px-6 py-2 text-sm flex items-center gap-2 cursor-pointer">
                <Plus className="w-4 h-4" /> Create New Pool
              </div>
            </Link>
          }
        />

        {isLoading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="w-8 h-8 animate-spin text-primary" />
          </div>
        ) : pools.length > 0 ? (
          <>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {pools.map((pool: any) => (
                <PoolCard key={pool.id} pool={pool} />
              ))}
            </div>
            <Pagination
              page={page}
              totalPages={totalPages}
              total={total}
              limit={PAGE_SIZE}
              onPageChange={setPage}
              isLoading={isLoading}
            />
          </>
        ) : (
          <EmptyState
            icon={Lock}
            {...getPrivatePoolsEmptyState(
              statusFilter,
              debouncedSearch.length > 0
            )}
            actionText="Create First Pool"
            actionHref="/create-pool"
          />
        )}
      </div>
    </Layout>
  );
}
