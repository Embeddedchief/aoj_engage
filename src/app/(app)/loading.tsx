import { AojLoader } from "@/components/aoj-loader";

/** Shown instantly while a page's data loads, centred over the content area. */
export default function Loading() {
  return (
    <div className="pointer-events-none fixed inset-0 z-10 grid place-items-center lg:pl-[17.5rem]">
      <AojLoader />
    </div>
  );
}
