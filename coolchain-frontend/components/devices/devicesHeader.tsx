import React from 'react';
import { Breadcrumbs, Button } from '@nextui-org/react';
import { BreadcrumbItem } from '@nextui-org/breadcrumbs';
import { useRouter } from 'next/navigation';

export const DevicesHeader = () => {
  const router = useRouter();

  return <>
    <Breadcrumbs>
      <BreadcrumbItem>Home</BreadcrumbItem>
      <BreadcrumbItem>Devices</BreadcrumbItem>
    </Breadcrumbs>

    <div className="flex flex-wrap justify-between">
      <h3 className="text-xl font-semibold">All Devices</h3>
      <Button color="primary" variant="flat" size="sm" onClick={() => router.push('/devices/add-multiple')}>
        Add devices
      </Button>
    </div>
  </>;
};