import UploadFileContainer from "@/components/uploadFileContainer";
import UploadMockup from "@/components/uploadMockup";

export default function EvaluateCalls() 
{ 
    return ( 
    <> 
        <div className="flex flex-col items-center h-screen mt-10"> 
            <h1 className="text-4xl font-extrabold mb-6 text-center" style={{ color: "#002d62" }}>
                Evaluate Calls
            </h1>
            <div className="w-full"> <UploadMockup /> </div> 
        </div> 
    </> ); 
}