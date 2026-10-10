"use client";

import { Card, CardBody } from "@/components/ui/Card";
import { Skeleton } from "@/components/ui/Feedback";

/**
 * Kerangka pemuatan tingkat segmen: muncul saat halaman /app berpindah atau
 * saat data belum siap, dengan bentuk yang mirip isi akhirnya.
 */
export default function AppLoading() {
  return (
    <div className="mx-auto max-w-[1240px] space-y-5" aria-busy="true">
      <p className="sr-only" role="status">
        Memuat halaman
      </p>
      <div className="space-y-2">
        <Skeleton className="h-3 w-28" />
        <Skeleton className="h-7 w-56" />
        <Skeleton className="h-4 w-96 max-w-full" />
      </div>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <Card key={i}>
            <CardBody className="space-y-3">
              <Skeleton className="h-3 w-24" />
              <Skeleton className="h-8 w-40" />
              <Skeleton className="h-3 w-32" />
            </CardBody>
          </Card>
        ))}
      </div>

      <Card>
        <CardBody className="space-y-3">
          <Skeleton className="h-4 w-48" />
          <Skeleton className="h-56 w-full" />
        </CardBody>
      </Card>

      <div className="grid gap-4 lg:grid-cols-2">
        {[0, 1].map((col) => (
          <Card key={col}>
            <CardBody className="space-y-3">
              <Skeleton className="h-4 w-40" />
              {Array.from({ length: 5 }).map((_, i) => (
                <Skeleton key={i} className="h-9 w-full" />
              ))}
            </CardBody>
          </Card>
        ))}
      </div>
    </div>
  );
}
