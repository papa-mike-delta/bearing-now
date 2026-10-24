import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { useOpenItem } from "./use-open-item";

const { effect } = vi.hoisted(() => ({ effect: vi.fn() }));
vi.mock("react", () => ({ useEffect: effect }));
const fetchMock = vi.fn();

function mount(id: string | null) {
  // eslint-disable-next-line react-hooks/rules-of-hooks -- useEffect is mocked to exercise the real setup/cleanup callbacks.
  useOpenItem(id);
  // Execute the production effect's setup/cleanup just as mount or React effect
  // replay does; do not duplicate its timer/transport implementation in tests.
  return effect.mock.calls.at(-1)![0]() as (() => void) | undefined;
}
const methods = () => fetchMock.mock.calls.map(([, init]) => init.method);
const leases = () => fetchMock.mock.calls.map(([, init]) => JSON.parse(init.body).lease);

beforeEach(() => {
  vi.useFakeTimers();
  vi.clearAllMocks();
  vi.stubGlobal("fetch", fetchMock);
  fetchMock.mockResolvedValue(new Response("{}"));
});
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); });

it("refreshes at 30 seconds and serializes cleanup after a delayed refresh", async () => {
  let release!: (value: Response) => void;
  fetchMock.mockImplementationOnce(() => new Promise<Response>((resolve) => { release = resolve; }));
  const close = mount("Item / with spaces")!;
  expect(fetchMock.mock.calls[0][0]).toBe("/api/items/Item%20%2F%20with%20spaces/open");
  await vi.advanceTimersByTimeAsync(29_999);
  expect(methods()).toEqual(["PUT"]);
  await vi.advanceTimersByTimeAsync(1);
  // Refresh waits for the first request, and cleanup waits for that refresh.
  close();
  expect(methods()).toEqual(["PUT"]);
  release(new Response("{}"));
  await vi.runAllTimersAsync();
  expect(methods()).toEqual(["PUT", "PUT", "DELETE"]);
  expect(new Set(leases()).size).toBe(1);
  await vi.advanceTimersByTimeAsync(120_000);
  expect(methods()).toEqual(["PUT", "PUT", "DELETE"]);
});

it("gives an effect replay/remount an independent lease while old cleanup waits", async () => {
  let release!: (value: Response) => void;
  fetchMock.mockImplementationOnce(() => new Promise<Response>((resolve) => { release = resolve; }));
  const closeOld = mount("item")!;
  closeOld();
  const closeNew = mount("item")!;
  const [oldLease, newLease] = leases();
  expect(oldLease).not.toBe(newLease);
  release(new Response("{}"));
  await vi.advanceTimersByTimeAsync(0);
  expect(methods()).toEqual(["PUT", "PUT", "DELETE"]);
  expect(leases()[2]).toBe(oldLease);
  closeNew();
  await vi.runAllTimersAsync();
  expect(methods()).toEqual(["PUT", "PUT", "DELETE", "DELETE"]);
  expect(leases()[3]).toBe(newLease);
});

it("still closes after a rejected request and does nothing without an Item", async () => {
  expect(mount(null)).toBeUndefined();
  expect(fetchMock).not.toHaveBeenCalled();
  fetchMock.mockRejectedValueOnce(new Error("network unavailable"));
  mount("item")!();
  await vi.runAllTimersAsync();
  expect(methods()).toEqual(["PUT", "DELETE"]);
});
