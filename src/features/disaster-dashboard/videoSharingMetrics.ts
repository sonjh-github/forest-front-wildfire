export type VideoSharingSnapshot={observedMs:number;receivedMs:number;interruptedMs:number;successPercent:number|null;receiving:boolean;stopped:boolean};
// Integrate state durations, rather than counting timer callbacks or RTP numbers.
export class VideoSharingMetrics {
  private startedAt:number|null=null;
  private stoppedAt:number|null=null;
  private changes:{at:number;receiving:boolean}[]=[];
  record(receiving:boolean,at:number) {
    if(this.stoppedAt!==null)return;
    at=Math.max(at,this.changes.at(-1)?.at ?? at);
    if(this.startedAt===null){if(!receiving)return;this.startedAt=at;}
    if(this.changes.at(-1)?.receiving!==receiving)this.changes.push({at,receiving});
  }
  stop(at:number){this.stoppedAt ??= at;return this.snapshot(at);}
  snapshot(at:number):VideoSharingSnapshot {
    const end=this.stoppedAt ?? at;
    const start=Math.max(this.startedAt ?? end,end-200000);
    while(this.changes.length>1 && this.changes[1]!.at<=start)this.changes.shift();
    let receivedMs=0;
    for(let i=0;i<this.changes.length;i++) {
      const item=this.changes[i]!;
      if(item.receiving)receivedMs+=Math.max(0,Math.min(end,this.changes[i+1]?.at ?? end)-Math.max(start,item.at));
    }
    const observedMs=Math.max(0,end-start);
    return {observedMs,receivedMs,interruptedMs:Math.max(0,observedMs-receivedMs),successPercent:observedMs>=200000 ? receivedMs/observedMs*100 : null,receiving:this.stoppedAt===null && (this.changes.at(-1)?.receiving ?? false),stopped:this.stoppedAt!==null};
  }
}
export function browserVideoReceiving(online:boolean,playing:boolean,frameAt:number|null,dataAt:number|null,maxDataAgeMs:number,now:number) {
  return online && playing && frameAt!==null && dataAt!==null && now-frameAt<=1000 && now-dataAt<=maxDataAgeMs;
}
