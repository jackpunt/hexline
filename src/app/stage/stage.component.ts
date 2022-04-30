import { Component, Input, OnInit } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { GameSetup } from '../game-setup';
import { stime } from '@thegraid/createjs-lib';

@Component({
  selector: 'stage-comp',
  templateUrl: './stage.component.html',
  styleUrls: ['./stage.component.css']
})
export class StageComponent implements OnInit {

  static idnum: number = 0;
  getId(): string {
    return "T" + (StageComponent.idnum = StageComponent.idnum + 1);
  };
  /** names of extensions to be removed: ext=Transit,Roads */
  @Input('ext')
  ext: string;

  @Input('width')
  width = 1600.0;   // [pixels] size of "Viewport" of the canvas / Stage
  @Input('height')
  height = 800.0;   // [pixels] size of "Viewport" of the canvas / Stage

  /** HTML make a \<canvas/> with this ID: */
  mapCanvasId = "mapCanvas" + this.getId(); // argument to new Stage(this.canvasId)
  
  constructor(private activatedRoute: ActivatedRoute) {}
  ngOnInit() {
    console.log(stime(this, ".noOnInit---"))
    let x = this.activatedRoute.params.subscribe(params => {
      console.log(stime(this, ".ngOnInit: params="), params)
    })
    let y = this.activatedRoute.queryParams.subscribe(params => {
      console.log(stime(this, ".ngOnInit: queryParams="), params)
      this.ext = params['ext'];
      console.log(stime(this, ".ngOnInit: ext="), this.ext);
    });
  }

  ngAfterViewInit() {
    setTimeout(()=>this.ngAfterViewInit2(), 250) //https://bugs.chromium.org/p/chromium/issues/detail?id=1229541
  }
  ngAfterViewInit2() {
    let href: string = document.location.href;
    console.log(stime(this, ".ngAfterViewInit---"), href, "ext=", this.ext)
    if (href.endsWith("startup")) { 

    }
    const urlParams = new URLSearchParams(window.location.search);
    let extstr = urlParams.get('ext')
    let ext = !!extstr ? extstr.split(',') : []
    new GameSetup(this.mapCanvasId).startup(undefined, ext) // load images; new GameSetup
  }
}
