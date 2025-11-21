import Dispatchers from "./dispatchers/page";

export default function Home() {
  return (
    <>
      <div className="flex flex-col items-center h-screen mt-10">
        <div className="w-full">
          <Dispatchers />
        </div>
      </div>
    </>
  );
}
