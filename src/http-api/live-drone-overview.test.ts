import {it,expect,vi} from 'vitest';
import {forestApi,loadEventOverview} from './forest-api';
it('operating overview loads Core telemetry and exposes canonical map geometry',async()=>{
 const eventId='integration-flight';const now=new Date().toISOString();
 vi.spyOn(forestApi,'dashboardDisasterAssets').mockResolvedValue({data:{disaster:{disasterId:eventId},assetCount:1,assets:[{assignment:{asset_id:'uuid',event_id:eventId,event_resource_id:'assignment',released_at:null},asset:{asset_id:'uuid',asset_code:'MD1000-01',asset_type:'UAV',asset_name:'registered'}}]}});
 vi.spyOn(forestApi,'dashboardDroneTelemetry').mockResolvedValue({data:[{assetId:'MD1000-01',eventId,observedAt:now,receivedAt:now,latitude:37.55,longitude:128.4,altitude:123}]});
 vi.spyOn(forestApi,'resources').mockResolvedValue({data:[{metricCode:'SHARING_SUCCESS',measuredValue:98.8,unit:'%',testRunId:'RUN-1',measurementSource:'CORE',rawLogRefs:['log-1'],verificationStatus:'VERIFIED',evidenceVerificationStatus:'VERIFIED',receivedAt:now}],page:{limit:100,nextCursor:null}});
 const result=await loadEventOverview({eventId});expect(result.assets[0]).toMatchObject({assetId:'uuid',geometry:{type:'Point',coordinates:[128.4,37.55,123]}});expect(result.liveDroneTelemetry).toEqual({status:'CONNECTED',matched:1,unmatched:0,live:1,stale:0,offline:0});expect(result.kpis).toHaveLength(1);expect(result.kpiApiStatus?.state).toBe('FRESH');
 vi.restoreAllMocks();
});
