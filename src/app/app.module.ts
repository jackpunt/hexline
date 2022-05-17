import { NgModule } from '@angular/core';
import { BrowserModule } from '@angular/platform-browser';

import { AppRoutingModule } from './app-routing.module';
import { AppComponent } from './app.component';
import { KeyBinder } from '@thegraid/easeljs-lib';
import { StageComponent } from './stage/stage.component';

@NgModule({
  declarations: [
    AppComponent,
    StageComponent
  ],
  imports: [
    BrowserModule,
    AppRoutingModule
  ],
  providers: [
    KeyBinder,
  ],
  bootstrap: [AppComponent]
})
export class AppModule { }
